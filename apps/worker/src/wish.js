import { requireActiveUser, requireAdmin } from './auth.js'
import { toEpochMs } from './comment.js'
import { jsonResp } from './http.js'
import { clearNotifications, pushNotification } from './notify.js'

// ==================== 心愿墙 ====================
/** 心愿墙：wish / wish_like / wish_message 三张表由人工建表；只展示最近 30 天的心愿 */
export const WISH_RECENT_DAYS = 30
export const WISH_MAX_LENGTH = 100
export const WISH_MESSAGE_MAX_LENGTH = 200
export const WISH_LIST_LIMIT = 120

/** 读取用户展示信息（昵称 + 头像 + VIP 等级），用于心愿/评论/歌单等场景 */
export async function getUserIdentity(env, userId) {
  if (!userId)
    return { nickname: '', avatar: '', vipLevel: 0 }
  const row = await env.DB.prepare('SELECT nickname, avatar_url, vip_level FROM users WHERE id = ?')
    .bind(userId)
    .first()
  return { nickname: row?.nickname || '', avatar: row?.avatar_url || '', vipLevel: Number(row?.vip_level) || 0 }
}

/** 心愿行 → 前端结构 */
export function mapWishRow(row, userId) {
  return {
    id: row.id,
    userId: String(row.user_id),
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    likeCount: Number(row.like_count) || 0,
    messageCount: Number(row.message_count) || 0,
    liked: !!row.liked,
    mine: String(row.user_id) === String(userId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 留言行 → 前端结构 */
export function mapWishMessageRow(row, userId) {
  return {
    id: row.id,
    wishId: row.wish_id,
    userId: String(row.user_id),
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    mine: String(row.user_id) === String(userId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 心愿列表 GET /api/wish/list：仅最近 30 天，按点赞数倒序（前端自行取 Top3 + 其余轮动） */
export async function handleGetWishes(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const { results } = await env.DB.prepare(
    `SELECT w.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level,
      (SELECT COUNT(*) FROM wish_message m WHERE m.wish_id = w.id) AS message_count,
      EXISTS(SELECT 1 FROM wish_like l WHERE l.wish_id = w.id AND l.user_id = ?) AS liked
    FROM wish w
    LEFT JOIN users u ON u.id = w.user_id
    WHERE w.create_time >= DATETIME('now', '-${WISH_RECENT_DAYS} day')
    ORDER BY w.like_count DESC, w.create_time DESC
    LIMIT ?`,
  ).bind(userId, WISH_LIST_LIMIT).all()
  return jsonResp({
    code: 200,
    msg: '获取心愿成功',
    data: (results || []).map(row => mapWishRow(row, userId)),
  })
}

/** 发表心愿 POST /api/wish/add { content } */
export async function handleAddWish(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能许愿' }, 401)
  }
  // 每周只能许一个心愿
  const recentWish = await env.DB.prepare(
    `SELECT create_time FROM wish
     WHERE user_id = ? AND create_time >= DATETIME('now', '-7 day')
     ORDER BY create_time DESC LIMIT 1`,
  ).bind(String(userId)).first()
  if (recentWish) {
    return jsonResp({ code: 400, msg: '本周心愿已经挂上墙啦，下周再来许愿吧' })
  }
  const body = await request.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  if (!content) {
    return jsonResp({ code: 400, msg: '心愿内容不能为空' })
  }
  if (content.length > WISH_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `心愿最多 ${WISH_MAX_LENGTH} 字` })
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO wish (user_id, content, like_count, create_time)
     VALUES (?, ?, 0, DATETIME('now'))`,
  ).bind(String(userId), content).run()
  const identity = await getUserIdentity(env, userId)
  return jsonResp({
    code: 200,
    msg: '许愿成功',
    data: {
      id: result.meta?.last_row_id,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      likeCount: 0,
      messageCount: 0,
      liked: false,
      mine: true,
      createTime: now,
    },
  })
}

/** 心愿点赞 / 取消点赞 POST /api/wish/like { id } */
export async function handleToggleWishLike(request, env) {
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
  const wish = await env.DB.prepare('SELECT id FROM wish WHERE id = ?').bind(id).first()
  if (!wish) {
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  }

  const likedRow = await env.DB.prepare('SELECT 1 AS liked FROM wish_like WHERE wish_id = ? AND user_id = ?')
    .bind(id, String(userId))
    .first()
  if (likedRow) {
    await env.DB.prepare('DELETE FROM wish_like WHERE wish_id = ? AND user_id = ?').bind(id, String(userId)).run()
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO wish_like (wish_id, user_id, create_time) VALUES (?, ?, DATETIME(\'now\'))')
      .bind(id, String(userId))
      .run()
  }

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM wish_like WHERE wish_id = ?').bind(id).first()
  const likeCount = countRow?.count || 0
  // 同步冗余计数，列表按 like_count 排序
  await env.DB.prepare('UPDATE wish SET like_count = ? WHERE id = ?').bind(likeCount, id).run()
  return jsonResp({ code: 200, msg: '操作成功', data: { liked: !likedRow, likeCount } })
}

/** 心愿留言列表 GET /api/wish/messages?wishId=1 */
export async function handleGetWishMessages(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const wishId = Number(new URL(request.url).searchParams.get('wishId'))
  if (!wishId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const { results } = await env.DB.prepare(
    `SELECT m.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level
    FROM wish_message m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.wish_id = ?
    ORDER BY m.create_time ASC
    LIMIT 200`,
  ).bind(wishId).all()
  return jsonResp({
    code: 200,
    msg: '获取留言成功',
    data: (results || []).map(row => mapWishMessageRow(row, userId)),
  })
}

/** 给心愿留言 POST /api/wish/message/add { wishId, content } */
export async function handleAddWishMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能留言' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const wishId = Number(body.wishId)
  const content = String(body.content || '').trim()
  if (!wishId || !content) {
    return jsonResp({ code: 400, msg: '留言内容不能为空' })
  }
  if (content.length > WISH_MESSAGE_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `留言最多 ${WISH_MESSAGE_MAX_LENGTH} 字` })
  }
  const wish = await env.DB.prepare('SELECT id, user_id, content FROM wish WHERE id = ?').bind(wishId).first()
  if (!wish) {
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO wish_message (wish_id, user_id, content, create_time)
     VALUES (?, ?, ?, DATETIME('now'))`,
  ).bind(wishId, String(userId), content).run()
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM wish_message WHERE wish_id = ?').bind(wishId).first()
  const identity = await getUserIdentity(env, userId)
  // 在别人的心愿下留言 → 通知心愿作者（自己给自己留言不通知）
  if (String(wish.user_id) !== String(userId)) {
    await pushNotification(env.DB, {
      userId: wish.user_id,
      type: 'wish_message',
      senderId: userId,
      senderName: identity.nickname,
      content,
      targetId: wishId,
      targetTitle: String(wish.content || '').slice(0, 40),
      refId: result.meta?.last_row_id || 0,
    })
  }
  return jsonResp({
    code: 200,
    msg: '留言成功',
    data: {
      id: result.meta?.last_row_id,
      wishId,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      mine: true,
      createTime: now,
      messageCount: countRow?.count || 0,
    },
  })
}

/** 管理员删除心愿 POST /api/wish/delete { id }：连同点赞与留言一并删除 */
export async function handleDeleteWish(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })
  const DB = env.DB
  const wish = await DB.prepare('SELECT id FROM wish WHERE id = ?').bind(id).first()
  if (!wish)
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  await clearNotifications(DB, {
    sql: `DELETE FROM user_notification WHERE type = 'wish_message' AND target_id = ?`,
    params: [id],
  })
  await DB.prepare('DELETE FROM wish_like WHERE wish_id = ?').bind(id).run()
  await DB.prepare('DELETE FROM wish_message WHERE wish_id = ?').bind(id).run()
  await DB.prepare('DELETE FROM wish WHERE id = ?').bind(id).run()
  return jsonResp({ code: 200, msg: '心愿已删除' })
}

/**
 * 站内通知表（需手动执行建表 SQL）：user_notification
 * 目前支持两种通知：comment_reply 评论回复、wish_message 心愿留言
 */

/** 写入通知：表未建时只打日志，不影响评论 / 留言主流程 */
