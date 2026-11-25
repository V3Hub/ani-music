import { requireActiveUser, requireAdmin } from './auth.js'
import { jsonResp } from './http.js'
import { pushNotification } from './notify.js'

export const ADMIN_MESSAGE_MAX_LENGTH = 500

/** 用户给管理员留言 POST /api/admin/message/add { content } —— 只发新留言，不参与对话 */
export async function handleAddAdminMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '登录后才能联系管理员' }, 401)
  const body = await request.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  if (!content)
    return jsonResp({ code: 400, msg: '留言内容不能为空' })
  if (content.length > ADMIN_MESSAGE_MAX_LENGTH)
    return jsonResp({ code: 400, msg: `留言最多 ${ADMIN_MESSAGE_MAX_LENGTH} 字` })

  // 24 小时内最多发 5 条留言
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM direct_message
     WHERE from_user_id = ? AND to_user_id = 'admin' AND parent_id = 0
       AND create_time >= DATETIME('now', '-1 day')`,
  ).bind(String(userId)).first()
  if ((countRow?.cnt || 0) >= 5)
    return jsonResp({ code: 429, msg: '留言过于频繁，请 24 小时后再试' }, 429)

  const info = await env.DB.prepare(
    `INSERT INTO direct_message (from_user_id, to_user_id, parent_id, content)
     VALUES (?, 'admin', 0, ?)`,
  ).bind(String(userId), content).run()

  // 给所有管理员推送站内通知（至少让管理员收到一条提醒）
  const admins = await env.DB.prepare(
    `SELECT id FROM users WHERE is_admin = 1`,
  ).all()
  for (const admin of admins.results || []) {
    await pushNotification(env.DB, {
      userId: admin.id,
      type: 'admin_message',
      senderId: userId,
      senderName: '用户',
      content,
      targetId: info.lastInsertRowid,
      targetTitle: '联系管理员',
    })
  }

  return jsonResp({ code: 200, msg: '留言已发送，管理员会尽快回复', data: { id: info.lastInsertRowid } })
}

/**
 * 用户拉取自己的留言列表 GET /api/admin/messages
 * 返回每条留言及其下的管理员回复：[{ id, content, create_time, replies: [...] }]
 */
export async function handleGetAdminMessages(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '请先登录' }, 401)

  const { results: messageRows } = await env.DB.prepare(
    `SELECT id, content, create_time FROM direct_message
     WHERE from_user_id = ? AND to_user_id = 'admin' AND parent_id = 0
     ORDER BY id DESC LIMIT 100`,
  ).bind(String(userId)).all()
  const messages = messageRows || []
  if (!messages.length)
    return jsonResp({ code: 200, msg: '获取成功', data: [] })

  const ids = messages.map(item => item.id)
  const placeholders = ids.map(() => '?').join(',')
  const { results: replyRows } = await env.DB.prepare(
    `SELECT id, parent_id, content, create_time FROM direct_message
     WHERE from_user_id = 'admin' AND parent_id IN (${placeholders})
     ORDER BY id ASC`,
  ).bind(...ids).all()

  const replyMap = new Map()
  for (const row of replyRows || []) {
    const pid = Number(row.parent_id)
    if (!replyMap.has(pid)) replyMap.set(pid, [])
    replyMap.get(pid).push(row)
  }

  const data = messages.map(item => ({
    id: item.id,
    content: item.content,
    create_time: item.create_time,
    replies: replyMap.get(Number(item.id)) || [],
  }))
  return jsonResp({ code: 200, msg: '获取成功', data })
}

/** 管理员收件箱列表 GET /api/admin/inbox?keyword= —— 一行即一条用户留言 */
export async function handleAdminInboxList(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const keyword = String(new URL(request.url).searchParams.get('keyword') || '').trim()

  const { results: messageRows } = await env.DB.prepare(
    `SELECT id, from_user_id AS user_id, content, create_time FROM direct_message
     WHERE to_user_id = 'admin' AND parent_id = 0
     ORDER BY id DESC LIMIT 200`,
  ).all()
  const rows = messageRows || []

  // 一次聚合出每条留言的回复数 / 最近回复时间
  const ids = rows.map(row => row.id)
  let replyMap = new Map()
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const { results: replyRows } = await env.DB.prepare(
      `SELECT parent_id, COUNT(*) AS cnt, MAX(create_time) AS last_reply_time
       FROM direct_message
       WHERE from_user_id = 'admin' AND parent_id IN (${placeholders})
       GROUP BY parent_id`,
    ).bind(...ids).all()
    replyMap = new Map((replyRows || []).map(row => [Number(row.parent_id), row]))
  }

  // 批量取用户资料
  const userIds = [...new Set(rows.map(row => String(row.user_id)))]
  let userMap = new Map()
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',')
    const { results: userRows } = await env.DB.prepare(
      `SELECT id, nickname, avatar_url, username FROM users WHERE id IN (${placeholders})`,
    ).bind(...userIds).all()
    userMap = new Map((userRows || []).map(u => [String(u.id), u]))
  }

  let data = rows.map((row) => {
    const reply = replyMap.get(Number(row.id))
    const uid = String(row.user_id)
    return {
      id: row.id,
      user_id: uid,
      content: row.content,
      create_time: row.create_time,
      reply_count: Number(reply?.cnt) || 0,
      last_reply_time: reply?.last_reply_time || '',
      nickname: userMap.get(uid)?.nickname || '',
      avatar_url: userMap.get(uid)?.avatar_url || '',
      username: userMap.get(uid)?.username || '',
    }
  })

  // 关键词过滤（应用层 LIKE）
  if (keyword) {
    const k = keyword.toLowerCase()
    data = data.filter(item =>
      (item.username || '').toLowerCase().includes(k)
      || (item.nickname || '').toLowerCase().includes(k),
    )
  }

  return jsonResp({ code: 200, msg: '获取成功', data })
}

/** 管理员查看单条留言详情 GET /api/admin/message/detail?id= */
export async function handleAdminMessageDetail(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const id = Number(new URL(request.url).searchParams.get('id')) || 0
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })

  const message = await env.DB.prepare(
    `SELECT id, from_user_id AS user_id, content, create_time FROM direct_message
     WHERE id = ? AND to_user_id = 'admin' AND parent_id = 0`,
  ).bind(id).first()
  if (!message)
    return jsonResp({ code: 404, msg: '留言不存在' }, 404)

  const user = await env.DB.prepare(
    `SELECT nickname, avatar_url, username FROM users WHERE id = ?`,
  ).bind(String(message.user_id)).first()

  const { results: replies } = await env.DB.prepare(
    `SELECT id, content, create_time FROM direct_message
     WHERE from_user_id = 'admin' AND parent_id = ?
     ORDER BY id ASC`,
  ).bind(id).all()

  return jsonResp({
    code: 200,
    msg: '获取成功',
    data: {
      message: {
        id: message.id,
        user_id: String(message.user_id),
        content: message.content,
        create_time: message.create_time,
        nickname: user?.nickname || '',
        avatar_url: user?.avatar_url || '',
        username: user?.username || '',
      },
      replies: replies || [],
    },
  })
}

/** 用户删除自己的留言 POST /api/admin/message/delete { id } —— 连带其下的管理员回复 */
export async function handleDeleteAdminMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '请先登录' }, 401)

  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })

  const target = await env.DB.prepare(
    `SELECT id FROM direct_message
     WHERE id = ? AND from_user_id = ? AND to_user_id = 'admin' AND parent_id = 0`,
  ).bind(id, String(userId)).first()
  if (!target)
    return jsonResp({ code: 404, msg: '留言不存在' }, 404)

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM direct_message WHERE parent_id = ? AND from_user_id = 'admin'`).bind(id),
    env.DB.prepare('DELETE FROM direct_message WHERE id = ?').bind(id),
  ])

  return jsonResp({ code: 200, msg: '已删除', data: null })
}

/** 管理员回复某条留言 POST /api/admin/inbox/reply { messageId, content } */
export async function handleAdminReplyMessage(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const body = await request.json().catch(() => ({}))
  const messageId = Number(body.messageId) || 0
  const content = String(body.content || '').trim()
  if (!messageId || !content)
    return jsonResp({ code: 400, msg: '回复内容不能为空' })
  if (content.length > ADMIN_MESSAGE_MAX_LENGTH)
    return jsonResp({ code: 400, msg: `回复最多 ${ADMIN_MESSAGE_MAX_LENGTH} 字` })

  const target = await env.DB.prepare(
    `SELECT id, from_user_id AS user_id FROM direct_message
     WHERE id = ? AND to_user_id = 'admin' AND parent_id = 0`,
  ).bind(messageId).first()
  if (!target)
    return jsonResp({ code: 404, msg: '留言不存在' }, 404)

  await env.DB.prepare(
    `INSERT INTO direct_message (from_user_id, to_user_id, parent_id, content)
     VALUES ('admin', ?, ?, ?)`,
  ).bind(String(target.user_id), messageId, content).run()

  // 给留言用户推送通知
  const adminRow = await env.DB.prepare(
    `SELECT nickname FROM users WHERE id = ?`,
  ).bind(adminId).first()
  await pushNotification(env.DB, {
    userId: Number(target.user_id),
    type: 'admin_reply',
    senderId: adminId,
    senderName: adminRow?.nickname || '管理员',
    content,
    targetId: messageId,
    targetTitle: '联系管理员',
  })

  return jsonResp({ code: 200, msg: '回复成功', data: null })
}

/**
 * 修改密码 POST /api/user/password
 * body: { oldPassword, newPassword }，需校验原密码，新密码至少 6 位
 */
