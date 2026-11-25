import { requireActiveUser } from './auth.js'
import { toEpochMs } from './comment.js'
import { jsonResp } from './http.js'

export function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    senderId: String(row.sender_id || ''),
    senderName: row.sender_nickname || row.sender_name || '',
    senderAvatar: row.sender_avatar || '',
    content: row.content || '',
    targetId: row.target_id,
    targetTitle: row.target_title || '',
    refId: row.ref_id || 0,
    refContent: row.ref_content || '',
    read: !!row.is_read,
    createTime: toEpochMs(row.create_time),
  }
}

/** 消息通知列表 GET /api/notification/list?page=&pageSize= */
export async function handleListNotifications(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
  const box = url.searchParams.get('box') === 'outbox' ? 'outbox' : 'inbox'

  // outbox：我发出的，sender_id = 当前用户；join 接收者资料（u.id = n.user_id），返回的 sender_* 字段含义变成"对方"
  // inbox：我收到的，user_id = 当前用户；join 发送者资料（u.id = n.sender_id）
  const whereCol = box === 'outbox' ? 'n.sender_id' : 'n.user_id'
  const joinCol = box === 'outbox' ? 'n.user_id' : 'n.sender_id'

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM user_notification n WHERE ${whereCol} = ?`)
    .bind(userId)
    .first()
  const { results } = await env.DB.prepare(
    `SELECT n.*, u.nickname AS sender_nickname, u.avatar_url AS sender_avatar
     FROM user_notification n
     LEFT JOIN users u ON u.id = ${joinCol}
     WHERE ${whereCol} = ?
     ORDER BY n.id DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, pageSize, (page - 1) * pageSize)
    .all()

  // 评论回复类通知：批量取被回复的那条评论原文，便于前端展示「回复的对象」
  const commentReplyRows = (results || []).filter(row => row.type === 'comment_reply' && Number(row.ref_id) > 0)
  if (commentReplyRows.length) {
    const refIds = [...new Set(commentReplyRows.map(row => Number(row.ref_id)))]
    try {
      const { results: refRows } = await env.DB.prepare(
        `SELECT id, content FROM song_comment WHERE id IN (${refIds.map(() => '?').join(',')})`,
      ).bind(...refIds).all()
      const refMap = new Map((refRows || []).map(row => [Number(row.id), String(row.content || '')]))
      commentReplyRows.forEach((row) => {
        row.ref_content = refMap.get(Number(row.ref_id)) || ''
      })
    } catch (e) {
      console.warn('[notification] 读取被回复评论失败', e)
    }
  }

  // 管理员留言 / 管理员回复 / 用户之间留言：target_id 存顶层 direct_message id
  const dmRows = (results || []).filter(
    row => ['admin_message', 'admin_reply', 'user_message'].includes(row.type) && Number(row.target_id) > 0,
  )
  if (dmRows.length) {
    const refIds = [...new Set(dmRows.map(row => Number(row.target_id)))]
    try {
      const { results: refRows } = await env.DB.prepare(
        `SELECT id, content FROM direct_message WHERE id IN (${refIds.map(() => '?').join(',')})`,
      ).bind(...refIds).all()
      const refMap = new Map((refRows || []).map(row => [Number(row.id), String(row.content || '')]))
      dmRows.forEach((row) => {
        row.ref_content = refMap.get(Number(row.target_id)) || ''
      })
    } catch (e) {
      console.warn('[notification] 读取被回复留言失败', e)
    }
  }

  // 心愿留言：ref_id 存父留言 id
  const wishRows = (results || []).filter(row => row.type === 'wish_message' && Number(row.ref_id) > 0)
  if (wishRows.length) {
    const refIds = [...new Set(wishRows.map(row => Number(row.ref_id)))]
    try {
      const { results: refRows } = await env.DB.prepare(
        `SELECT id, content FROM wish_message WHERE id IN (${refIds.map(() => '?').join(',')})`,
      ).bind(...refIds).all()
      const refMap = new Map((refRows || []).map(row => [Number(row.id), String(row.content || '')]))
      wishRows.forEach((row) => {
        row.ref_content = refMap.get(Number(row.ref_id)) || ''
      })
    } catch (e) {
      console.warn('[notification] 读取被回复心愿留言失败', e)
    }
  }

  const readMapFn = box === 'outbox'
    ? () => true
    : row => !!row.is_read
  return jsonResp({
    code: 200,
    msg: '获取通知成功',
    data: {
      list: (results || []).map(row => ({ ...mapNotificationRow(row), read: readMapFn(row) })),
      total: Number(totalRow?.count) || 0,
      page,
      pageSize,
    },
  })
}

/** 未读通知数 GET /api/notification/unread */
export async function handleNotificationUnreadCount(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_notification WHERE user_id = ? AND is_read = 0')
    .bind(userId)
    .first()
  return jsonResp({ code: 200, msg: '获取未读数成功', data: { count: Number(row?.count) || 0 } })
}

/** 标记已读 POST /api/notification/read { id? }：传 id 标记单条，不传标记全部 */
export async function handleMarkNotificationsRead(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  const result = id
    ? await env.DB.prepare('UPDATE user_notification SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, userId).run()
    : await env.DB.prepare('UPDATE user_notification SET is_read = 1 WHERE user_id = ? AND is_read = 0').bind(userId).run()
  return jsonResp({ code: 200, msg: '操作成功', data: { count: result.meta?.changes || 0 } })
}

/** 删除通知 POST /api/notification/delete { id? }：传 id 删单条；read=1 清空已读；all=1 清空全部（仅自己收到的） */
export async function handleDeleteNotification(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  let result
  if (id) {
    // 接收方（user_id）和发送方（sender_id）都能删掉自己那侧的通知记录
    result = await env.DB.prepare(
      'DELETE FROM user_notification WHERE id = ? AND (user_id = ? OR sender_id = ?)',
    ).bind(id, userId, userId).run()
  } else if (body.read === 1 || body.read === true) {
    result = await env.DB.prepare('DELETE FROM user_notification WHERE user_id = ? AND is_read = 1').bind(userId).run()
  } else if (body.all === 1 || body.all === true) {
    result = await env.DB.prepare('DELETE FROM user_notification WHERE user_id = ?').bind(userId).run()
  } else {
    return jsonResp({ code: 400, msg: '参数错误', data: null })
  }
  return jsonResp({ code: 200, msg: '已删除', data: { count: result.meta?.changes || 0 } })
}
