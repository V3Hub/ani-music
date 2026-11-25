import { isBanActive, requireAdmin } from './auth.js'
import { APP_CONFIG } from './config.js'
import { deleteUserCascade } from './db.js'
import { jsonResp } from './http.js'
import { sha256Hex } from './user.js'

export async function handleAdminListUsers(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
  const keyword = String(url.searchParams.get('keyword') || '').trim()
  const statusParam = String(url.searchParams.get('status') || 'all').trim()

  // 禁止管理员本人出现在列表里，避免误操作自己
  const adminRow = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(adminId).first()
  if (!adminRow?.is_admin)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const where = ['id != ?']
  const params = [adminId]
  if (keyword) {
    where.push(`(username LIKE ? OR nickname LIKE ? OR phone LIKE ? OR email LIKE ?)`)
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }
  if (statusParam === 'active' || statusParam === 'banned') {
    where.push(`COALESCE(status, 'active') = ?`)
    params.push(statusParam)
  }

  const whereSql = where.join(' AND ')
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM users WHERE ${whereSql}`,
  ).bind(...params).first()
  const { results } = await env.DB.prepare(
    `SELECT id, username, nickname, avatar_url, is_admin, vip_level,
            COALESCE(status, 'active') AS status,
            ban_reason, ban_time, ban_until, create_time
     FROM users WHERE ${whereSql}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).bind(...params, pageSize, (page - 1) * pageSize).all()

  // 批量从 KV 取最近访问 IP（key: user_ip:{id}，TTL 30 天，过期则空）
  const rows = results || []
  const ipMap = new Map()
  if (env.HOT_KV && rows.length) {
    try {
      const kv = env.HOT_KV
      await Promise.all(rows.map(async r => {
        const ip = await kv.get(`user_ip:${r.id}`)
        if (ip) ipMap.set(r.id, ip)
      }))
    } catch {}
  }

  const list = rows.map((row) => ({
    id: row.id,
    username: row.username || '',
    nickname: row.nickname || '',
    avatar_url: row.avatar_url || '',
    is_admin: !!row.is_admin,
    vip_level: Number(row.vip_level) || 0,
    status: row.status || 'active',
    ban_reason: row.ban_reason || '',
    ban_time: row.ban_time || '',
    ban_until: row.ban_until || '',
    create_time: row.create_time || '',
    last_login_ip: ipMap.get(row.id) || '',
  }))

  return jsonResp({
    code: 200,
    data: {
      list,
      total: Number(totalRow?.count) || 0,
      page,
      pageSize,
    },
  })
}

/** 管理员：封禁用户 POST /api/admin/user/ban { id, reason?, days? } —— days 为 0/缺省表示永久 */
export async function handleAdminBanUser(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id || id === Number(adminId))
    return jsonResp({ code: 400, msg: '参数错误' })
  const reason = String(body.reason || '').trim()
  const days = Math.max(0, Number(body.days) || 0)
  const banUntil = days > 0
    ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    : null

  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!row)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  await env.DB.prepare(
    `UPDATE users SET status = 'banned', ban_reason = ?, ban_time = DATETIME('now'), ban_until = ? WHERE id = ?`,
  ).bind(reason, banUntil, id).run()
  return jsonResp({ code: 200, msg: days > 0 ? `已封禁 ${days} 天` : '已永久封禁' })
}

/** 管理员：解封用户 POST /api/admin/user/unban { id } */
export async function handleAdminUnbanUser(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })

  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!row)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  await env.DB.prepare(
    `UPDATE users SET status = 'active', ban_reason = '', ban_time = NULL, ban_until = NULL WHERE id = ?`,
  ).bind(id).run()
  return jsonResp({ code: 200, msg: '已解封' })
}

/** 管理员：IP 黑名单列表 GET /api/admin/ip-blacklist?keyword= */
export async function handleAdminListIpBlacklist(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const keyword = String(url.searchParams.get('keyword') || '').trim()

  try {
    const whereSql = keyword ? 'WHERE ip LIKE ? OR reason LIKE ?' : ''
    const stmt = env.DB.prepare(
      `SELECT ip, reason, expire_time, create_time FROM ip_blacklist ${whereSql} ORDER BY id DESC LIMIT 200`,
    )
    const { results } = keyword
      ? await stmt.bind(`%${keyword}%`, `%${keyword}%`).all()
      : await stmt.all()
    const list = (results || []).map(row => ({
      ip: row.ip,
      reason: row.reason || '',
      expire_time: row.expire_time || '',
      create_time: row.create_time || '',
      expired: !!row.expire_time && !isBanActive(row.expire_time),
    }))
    return jsonResp({ code: 200, data: list })
  } catch {
    return jsonResp({ code: 500, msg: 'IP 黑名单表不存在，请先执行建表 SQL' })
  }
}

/** 管理员：拉黑 IP POST /api/admin/ip-blacklist/add { ip, reason?, days? } —— days 为 0/缺省表示永久 */
export async function handleAdminAddIpBlacklist(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const ip = String(body.ip || '').trim()
  if (!ip || ip.length > 64)
    return jsonResp({ code: 400, msg: '请输入合法的 IP' })
  const reason = String(body.reason || '').trim()
  const days = Math.max(0, Number(body.days) || 0)
  const expireTime = days > 0
    ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    : null

  try {
    await env.DB.prepare(
      `INSERT INTO ip_blacklist (ip, reason, expire_time, create_time)
       VALUES (?, ?, ?, DATETIME('now'))
       ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, expire_time = excluded.expire_time`,
    ).bind(ip, reason, expireTime).run()
    return jsonResp({ code: 200, msg: days > 0 ? `已拉黑 ${days} 天` : '已永久拉黑' })
  } catch {
    return jsonResp({ code: 500, msg: 'IP 黑名单表不存在，请先执行建表 SQL' })
  }
}

/** 管理员：移除 IP 黑名单 POST /api/admin/ip-blacklist/remove { ip } */
export async function handleAdminRemoveIpBlacklist(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const ip = String(body.ip || '').trim()
  if (!ip)
    return jsonResp({ code: 400, msg: '参数错误' })

  try {
    await env.DB.prepare('DELETE FROM ip_blacklist WHERE ip = ?').bind(ip).run()
    return jsonResp({ code: 200, msg: '已移除' })
  } catch {
    return jsonResp({ code: 500, msg: 'IP 黑名单表不存在，请先执行建表 SQL' })
  }
}

/** 管理员：重置密码 POST /api/admin/user/reset-password { id, password? } 默认 123456 */
export async function handleAdminResetPassword(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })

  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!row)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  const raw = String(body.password || '123456')
  if (raw.length < 6 || raw.length > 64)
    return jsonResp({ code: 400, msg: '密码长度需 6-64 位' })
  const hashed = await sha256Hex(raw + APP_CONFIG.secretKey)
  await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashed, id).run()
  return jsonResp({ code: 200, msg: '密码已重置', data: { password: raw } })
}

/** 管理员：删除用户 POST /api/admin/user/delete { id } —— 复用 deleteUserCascade 级联 */
export async function handleAdminDeleteUser(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id) || 0
  if (!id || id === Number(adminId))
    return jsonResp({ code: 400, msg: '不能删除自己' })

  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!row)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  await deleteUserCascade(env.DB, id)
  return jsonResp({ code: 200, msg: '已删除' })
}

/** 管理员：注册申请列表 GET /api/admin/registrations?status=pending|approved|rejected|all */
export async function handleAdminListRegistrations(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const statusParam = String(url.searchParams.get('status') || 'pending')
  const keyword = String(url.searchParams.get('keyword') || '').trim()
  const from = String(url.searchParams.get('from') || '').trim()
  const to = String(url.searchParams.get('to') || '').trim()

  const conditions = []
  const binds = []
  if (statusParam !== 'all') {
    conditions.push(`status = ?`)
    binds.push(statusParam.replace(/[^a-z]/g, ''))
  }
  if (keyword) {
    const like = `%${keyword}%`
    conditions.push(`(username LIKE ? OR nickname LIKE ? OR phone LIKE ? OR email LIKE ?)`)
    binds.push(like, like, like, like)
  }
  if (from) {
    conditions.push(`create_time >= ?`)
    binds.push(from)
  }
  if (to) {
    // 结束时间取当天 23:59:59 避免漏掉最后一天
    const toEnd = to.length === 10 ? `${to} 23:59:59` : to
    conditions.push(`create_time <= ?`)
    binds.push(toEnd)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, username, nickname, phone, email, payment_screenshot, status,
            reject_reason, create_time, review_time
     FROM registration_request ${where} ORDER BY id DESC LIMIT 200`,
  ).bind(...binds).all()
  return jsonResp({ code: 200, data: results || [] })
}

/**
 * 管理员：审批 POST /api/admin/registration/review
 * body: { id, action: 'approve' | 'reject', rejectReason? }
 * 通过时直接更新提交者的 users 记录（vip_level = 1），账号即刻生效
 */
export async function handleAdminReviewRegistration(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  const action = String(body.action || '')
  const rejectReason = String(body.rejectReason || '').trim()
  if (!id || !['approve', 'reject'].includes(action)) {
    return jsonResp({ code: 400, msg: '参数不完整' })
  }
  const DB = env.DB
  const req = await DB.prepare(`SELECT * FROM registration_request WHERE id = ?`).bind(id).first()
  if (!req?.id)
    return jsonResp({ code: 404, msg: '申请不存在' })
  if (req.status !== 'pending')
    return jsonResp({ code: 400, msg: '该申请已处理，请刷新列表' })

  if (action === 'reject') {
    await DB.prepare(
      `UPDATE registration_request
       SET status = 'rejected', reject_reason = ?, review_time = DATETIME('now'), reviewer_id = ?
       WHERE id = ?`,
    ).bind(rejectReason || '未通过审核', adminId, id).run()
    return jsonResp({ code: 200, msg: '已拒绝该申请' })
  }

  // 通过：直接更新提交申请的那个用户（同 userToken 无需重新登录）
  // user_id 为必填，申请未绑定用户时不允许通过
  const targetUserId = Number(req.user_id) || 0
  if (!targetUserId)
    return jsonResp({ code: 400, msg: '该申请未绑定用户，无法通过' })

  // 用户名需排除自身；手机号、邮箱允许重复
  const dup = await DB.prepare(
    'SELECT id FROM users WHERE id != ? AND username = ? LIMIT 1',
  ).bind(targetUserId, req.username).first()
  if (dup)
    return jsonResp({ code: 400, msg: '用户名已被占用，请拒绝该申请' })

  const exist = await DB.prepare('SELECT id, vip_level FROM users WHERE id = ?').bind(targetUserId).first()
  if (!exist?.id)
    return jsonResp({ code: 400, msg: '申请对应的用户不存在' })
  const fromLevel = Number(exist.vip_level) || 0

  // 注册成功即为永久 VIP（vip_level = 1）
  await DB.prepare(
    `UPDATE users
     SET username = ?, nickname = ?, password = ?, phone = ?, email = ?, vip_level = 1
     WHERE id = ?`,
  ).bind(req.username, req.nickname, req.password, req.phone || null, req.email || null, targetUserId).run()
  await DB.prepare(
    `INSERT INTO vip_record (user_id, from_level, to_level, change_type, remark, operator_id, create_time)
     VALUES (?, ?, 1, 'register', '注册审批通过，开通永久 VIP', ?, DATETIME('now'))`,
  ).bind(targetUserId, fromLevel, adminId).run()
  await DB.prepare(
    `UPDATE registration_request
     SET status = 'approved', review_time = DATETIME('now'), reviewer_id = ? WHERE id = ?`,
  ).bind(adminId, id).run()
  return jsonResp({ code: 200, msg: '已通过，账号已生效（永久 VIP）' })
}

/**
 * 管理员：调整用户 VIP 等级 POST /api/admin/user/vip-level
 * body: { username, level, remark? }，level 1-9；变更写入 vip_record
 */
export async function handleAdminSetVipLevel(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const level = Number(body.level)
  const remark = String(body.remark || '').trim()
  if (!username || !Number.isInteger(level) || level < 1 || level > 9) {
    return jsonResp({ code: 400, msg: '参数错误：level 需为 1-9 的整数' })
  }
  const DB = env.DB
  const user = await DB.prepare('SELECT id, vip_level FROM users WHERE username = ?').bind(username).first()
  if (!user?.id)
    return jsonResp({ code: 404, msg: '用户不存在' })
  const fromLevel = Number(user.vip_level) || 0
  if (fromLevel === level)
    return jsonResp({ code: 400, msg: '该用户已是此等级' })
  await DB.prepare('UPDATE users SET vip_level = ? WHERE id = ?').bind(level, user.id).run()
  await DB.prepare(
    `INSERT INTO vip_record (user_id, from_level, to_level, change_type, remark, operator_id, create_time)
     VALUES (?, ?, ?, 'admin', ?, ?, DATETIME('now'))`,
  ).bind(user.id, fromLevel, level, remark || `管理员调整等级 VIP${fromLevel} → VIP${level}`, adminId).run()
  return jsonResp({ code: 200, msg: `已调整为 VIP${level}`, data: { userId: user.id, vipLevel: level } })
}

/** 管理员：用户 VIP 变更记录 GET /api/admin/user/vip-records?username=xxx */
export async function handleAdminVipRecords(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const username = String(url.searchParams.get('username') || '').trim()
  if (!username)
    return jsonResp({ code: 400, msg: '请输入用户名' })
  const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (!user?.id)
    return jsonResp({ code: 404, msg: '用户不存在' })
  const { results } = await env.DB.prepare(
    `SELECT id, from_level, to_level, change_type, remark, create_time
     FROM vip_record WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
  ).bind(user.id).all()
  return jsonResp({ code: 200, data: results || [] })
}

/**
 * 用户端：上报接口错误 POST /api/error-log/report
 * body: { url, method, httpStatus, bizCode?, message?, detail? }
 * 前端已过滤断网 / 超时等用户自身网络问题，这里只负责落库
 */
