import { requireActiveUser } from './auth.js'
import { jsonResp } from './http.js'
import { pushNotification } from './notify.js'
import { getUserIdentity } from './wish.js'

export const USER_MESSAGE_MAX_LENGTH = 200

/** 给他人留言 POST /api/user/message { userId, content }：写入对方的站内通知 */
export async function handleSendUserMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '登录后才能留言' }, 401)
  const body = await request.json().catch(() => ({}))
  const targetId = Number(body.userId)
  const content = String(body.content || '').trim()
  if (!targetId || !content)
    return jsonResp({ code: 400, msg: '留言内容不能为空' })
  if (content.length > USER_MESSAGE_MAX_LENGTH)
    return jsonResp({ code: 400, msg: `留言最多 ${USER_MESSAGE_MAX_LENGTH} 字` })
  if (String(targetId) === String(userId))
    return jsonResp({ code: 400, msg: '不能给自己留言' })

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first()
  if (!target?.id)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  const identity = await getUserIdentity(env, userId)
  const info = await env.DB.prepare(
    `INSERT INTO direct_message (from_user_id, to_user_id, parent_id, content)
     VALUES (?, ?, 0, ?)`,
  ).bind(String(userId), String(targetId), content).run()

  await pushNotification(env.DB, {
    userId: targetId,
    type: 'user_message',
    senderId: userId,
    senderName: identity.nickname,
    content,
    targetId: info.lastInsertRowid,
    targetTitle: '留言',
  })
  return jsonResp({ code: 200, msg: '留言已送达', data: { id: info.lastInsertRowid } })
}

/**
 * 我和某人的留言记录 GET /api/user/messages?userId=
 * 返回双方发出的顶层留言及各自的回复
 */
export async function handleGetUserMessages(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '请先登录' }, 401)

  const targetId = Number(new URL(request.url).searchParams.get('userId')) || 0
  if (!targetId)
    return jsonResp({ code: 400, msg: '参数错误' })

  const me = String(userId)
  const other = String(targetId)

  const { results: rows } = await env.DB.prepare(
    `SELECT id, from_user_id, content, create_time FROM direct_message
     WHERE parent_id = 0
       AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
     ORDER BY id DESC LIMIT 100`,
  ).bind(me, other, other, me).all()
  const messages = rows || []
  if (!messages.length)
    return jsonResp({ code: 200, msg: '获取成功', data: [] })

  const ids = messages.map(item => item.id)
  const placeholders = ids.map(() => '?').join(',')
  const { results: replyRows } = await env.DB.prepare(
    `SELECT id, parent_id, from_user_id, content, create_time FROM direct_message
     WHERE parent_id IN (${placeholders})
     ORDER BY id ASC`,
  ).bind(...ids).all()

  const replyMap = new Map()
  for (const row of replyRows || []) {
    const pid = Number(row.parent_id)
    if (!replyMap.has(pid)) replyMap.set(pid, [])
    replyMap.get(pid).push(row)
  }

  return jsonResp({
    code: 200,
    msg: '获取成功',
    data: messages.map(item => ({
      id: item.id,
      from_user_id: String(item.from_user_id),
      content: item.content,
      create_time: item.create_time,
      replies: replyMap.get(Number(item.id)) || [],
    })),
  })
}

/** 回复别人给你的留言 POST /api/user/message/reply { messageId, content } */
export async function handleReplyUserMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '请先登录' }, 401)

  const body = await request.json().catch(() => ({}))
  const messageId = Number(body.messageId) || 0
  const content = String(body.content || '').trim()
  if (!messageId || !content)
    return jsonResp({ code: 400, msg: '回复内容不能为空' })
  if (content.length > USER_MESSAGE_MAX_LENGTH)
    return jsonResp({ code: 400, msg: `回复最多 ${USER_MESSAGE_MAX_LENGTH} 字` })

  const target = await env.DB.prepare(
    `SELECT id, from_user_id, to_user_id, parent_id FROM direct_message WHERE id = ?`,
  ).bind(messageId).first()
  if (!target)
    return jsonResp({ code: 404, msg: '留言不存在' }, 404)
  if (String(target.to_user_id) !== String(userId))
    return jsonResp({ code: 403, msg: '只能回复给你的留言' }, 403)

  // 回复统一挂在顶层留言下，便于列表聚合
  const rootId = Number(target.parent_id) || Number(target.id)
  await env.DB.prepare(
    `INSERT INTO direct_message (from_user_id, to_user_id, parent_id, content)
     VALUES (?, ?, ?, ?)`,
  ).bind(String(userId), String(target.from_user_id), rootId, content).run()

  const identity = await getUserIdentity(env, userId)
  await pushNotification(env.DB, {
    userId: Number(target.from_user_id),
    type: 'user_message',
    senderId: userId,
    senderName: identity.nickname,
    content,
    targetId: rootId,
    targetTitle: '留言',
  })

  return jsonResp({ code: 200, msg: '回复成功', data: null })
}

/** 删除自己发出的留言 POST /api/user/message/delete { id } —— 连带其下回复 */
export async function handleDeleteUserMessage(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  if (!userId)
    return jsonResp({ code: 401, msg: '请先登录' }, 401)

  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })

  const target = await env.DB.prepare(
    `SELECT id FROM direct_message WHERE id = ? AND from_user_id = ? AND parent_id = 0`,
  ).bind(id, String(userId)).first()
  if (!target)
    return jsonResp({ code: 404, msg: '留言不存在' }, 404)

  await env.DB.batch([
    env.DB.prepare('DELETE FROM direct_message WHERE parent_id = ?').bind(id),
    env.DB.prepare('DELETE FROM direct_message WHERE id = ?').bind(id),
  ])

  return jsonResp({ code: 200, msg: '已删除', data: null })
}

/** 联系管理员留言的最大长度 */
