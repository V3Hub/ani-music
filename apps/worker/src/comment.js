import { requireActiveUser, requireAdmin } from './auth.js'
import { jsonResp } from './http.js'
import { clearNotifications, pushNotification } from './notify.js'
import { getUserIdentity } from './wish.js'

export const COMMENT_MAX_LENGTH = 500
export const COMMENT_PAGE_SIZE = 20

/** 数据库时间值 → 毫秒时间戳：兼容纯数字时间戳与 'YYYY-MM-DD HH:MM:SS'（UTC） */
export function toEpochMs(value) {
  if (value == null || value === '')
    return 0
  if (typeof value === 'number')
    return value
  const str = String(value).trim()
  if (/^\d+$/.test(str))
    return Number(str)
  const ms = Date.parse(`${str.replace(' ', 'T')}Z`)
  return Number.isFinite(ms) ? ms : 0
}

export function mapCommentRow(row, liked, currentUserId) {
  return {
    id: row.id,
    songId: row.song_id,
    userId: row.user_id,
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    parentId: row.parent_id,
    likeCount: row.like_count,
    replyCount: row.reply_count || 0,
    liked: !!liked,
    mine: String(row.user_id) === String(currentUserId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 评论列表 GET /api/song/comment?songId=&parentId=&sort=default|latest&page=&pageSize= */
export async function handleGetComments(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const url = new URL(request.url)
  const songId = Number(url.searchParams.get('songId'))
  const parentId = Number(url.searchParams.get('parentId') || 0)
  const sort = url.searchParams.get('sort') === 'latest' ? 'latest' : 'default'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || COMMENT_PAGE_SIZE))
  if (!songId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }

  const where = parentId ? 'c.song_id = ? AND c.parent_id = ?' : 'c.song_id = ? AND c.parent_id = 0'
  const whereParams = parentId ? [songId, parentId] : [songId]
  const order = sort === 'latest' ? 'c.create_time DESC' : 'c.like_count DESC, c.create_time DESC'
  const sql = `SELECT c.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level,
      EXISTS(SELECT 1 FROM song_comment_like l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked
    FROM song_comment c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?`
  const { results } = await env.DB.prepare(sql)
    .bind(userId, ...whereParams, pageSize, (page - 1) * pageSize)
    .all()

  // 批量取所有评论的回复数，避免每行跑一次 COUNT 子查询
  const commentRows = results || []
  const commentIds = commentRows.map(r => r.id)
  const replyCountMap = new Map()
  if (commentIds.length) {
    const placeholders = commentIds.map(() => '?').join(',')
    const { results: replyRows } = await env.DB.prepare(
      `SELECT parent_id, COUNT(*) AS cnt FROM song_comment WHERE parent_id IN (${placeholders}) GROUP BY parent_id`,
    ).bind(...commentIds).all()
    for (const row of replyRows || []) {
      replyCountMap.set(row.parent_id, Number(row.cnt) || 0)
    }
  }

  return jsonResp({
    code: 200,
    msg: '获取评论成功',
    data: commentRows.map((row) => {
      const mapped = mapCommentRow(row, row.liked, userId)
      mapped.replyCount = replyCountMap.get(row.id) || 0
      return mapped
    }),
  })
}

/** 评论总数 GET /api/song/comment/count?songId=1（含回复） */
export async function handleGetCommentCount(request, env) {
  const songId = Number(new URL(request.url).searchParams.get('songId'))
  if (!songId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM song_comment WHERE song_id = ?').bind(songId).first()
  return jsonResp({ code: 200, msg: '获取评论数成功', data: { count: row?.count || 0 } })
}

/** 发布评论 POST /api/song/comment { songId, content, parentId? } */
export async function handleAddComment(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能评论' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const songId = Number(body.songId)
  const content = String(body.content || '').trim()
  let parentId = Number(body.parentId) || 0
  /** 被回复评论的作者，用于站内通知 */
  let replyToUserId = ''
  if (!songId || !content) {
    return jsonResp({ code: 400, msg: '评论内容不能为空' })
  }
  if (content.length > COMMENT_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `评论最多 ${COMMENT_MAX_LENGTH} 字` })
  }
  if (parentId) {
    const parent = await env.DB.prepare('SELECT id, song_id, parent_id, user_id FROM song_comment WHERE id = ?').bind(parentId).first()
    if (!parent || parent.song_id !== songId) {
      return jsonResp({ code: 400, msg: '回复的评论不存在' })
    }
    replyToUserId = String(parent.user_id || '')
    // 二级回复归到顶层，保持一层结构
    parentId = parent.parent_id || parentId
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO song_comment (song_id, user_id, content, parent_id, like_count, create_time)
     VALUES (?, ?, ?, ?, 0, DATETIME('now'))`,
  ).bind(songId, String(userId), content, parentId).run()
  const identity = await getUserIdentity(env, userId)
  // 回复了别人的评论 → 给被回复的人发站内通知（自己回复自己不通知）
  if (replyToUserId && replyToUserId !== String(userId)) {
    const songRow = await env.DB.prepare('SELECT title FROM songs WHERE id = ?').bind(songId).first()
    await pushNotification(env.DB, {
      userId: replyToUserId,
      type: 'comment_reply',
      senderId: userId,
      senderName: identity.nickname,
      content,
      targetId: songId,
      targetTitle: songRow?.title || '',
      refId: Number(body.parentId) || 0,
    })
  }
  return jsonResp({
    code: 200,
    msg: '评论成功',
    data: {
      id: result.meta?.last_row_id,
      songId,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      parentId,
      likeCount: 0,
      replyCount: 0,
      liked: false,
      mine: true,
      createTime: now,
    },
  })
}

/** 点赞 / 取消点赞 POST /api/song/comment/like { id } */
export async function handleToggleCommentLike(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能点赞' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const comment = await env.DB.prepare('SELECT id FROM song_comment WHERE id = ?').bind(id).first()
  if (!comment) {
    return jsonResp({ code: 404, msg: '评论不存在' }, 404)
  }

  const likedRow = await env.DB.prepare('SELECT 1 AS liked FROM song_comment_like WHERE comment_id = ? AND user_id = ?')
    .bind(id, String(userId))
    .first()
  if (likedRow) {
    await env.DB.prepare('DELETE FROM song_comment_like WHERE comment_id = ? AND user_id = ?').bind(id, String(userId)).run()
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO song_comment_like (comment_id, user_id) VALUES (?, ?)').bind(id, String(userId)).run()
  }

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM song_comment_like WHERE comment_id = ?').bind(id).first()
  const likeCount = countRow?.count || 0
  // 同步冗余计数，供「默认」排序使用
  await env.DB.prepare('UPDATE song_comment SET like_count = ? WHERE id = ?').bind(likeCount, id).run()
  return jsonResp({ code: 200, msg: '操作成功', data: { liked: !likedRow, likeCount } })
}

/** 删除评论 POST /api/song/comment/delete { id }：作者本人或管理员，连同其回复一并删除 */
export async function handleDeleteComment(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能删除评论' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const comment = await env.DB.prepare('SELECT id, user_id FROM song_comment WHERE id = ?').bind(id).first()
  if (!comment) {
    return jsonResp({ code: 404, msg: '评论不存在' }, 404)
  }
  const isAuthor = String(comment.user_id) === String(userId)
  if (!isAuthor && !(await requireAdmin(request, env))) {
    return jsonResp({ code: 403, msg: '只能删除自己的评论' }, 403)
  }

  // 先清理该评论（含其回复）产生的通知，再清点赞记录与评论本身
  await clearNotifications(env.DB, {
    sql: `DELETE FROM user_notification
          WHERE type = 'comment_reply'
            AND (ref_id = ? OR ref_id IN (SELECT id FROM song_comment WHERE parent_id = ?))`,
    params: [id, id],
  })
  // 先清理点赞记录（含子回复），再删评论与回复
  await env.DB.prepare(
    'DELETE FROM song_comment_like WHERE comment_id = ? OR comment_id IN (SELECT id FROM song_comment WHERE parent_id = ?)',
  ).bind(id, id).run()
  const result = await env.DB.prepare('DELETE FROM song_comment WHERE id = ? OR parent_id = ?').bind(id, id).run()
  return jsonResp({ code: 200, msg: '删除成功', data: { count: result.meta?.changes || 0 } })
}

/** 歌曲详情 GET /api/song/detail?id=xx：返回统一 Song 字段 + 收藏状态 */
