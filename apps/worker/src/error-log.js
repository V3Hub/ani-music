import { getUserIdFromToken, requireAdmin } from './auth.js'
import { jsonResp } from './http.js'

export async function handleReportErrorLog(request, env) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 20000)
    return jsonResp({ code: 413, msg: '上报内容过大' }, 413)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object')
    return jsonResp({ code: 400, msg: '参数错误' })
  const url = String(body.url || '').slice(0, 500)
  if (!url)
    return jsonResp({ code: 400, msg: '缺少接口地址' })
  const method = String(body.method || 'GET').toUpperCase().slice(0, 10)
  const httpStatus = Number(body.httpStatus) || 0
  const bizCode = Number.isFinite(Number(body.bizCode)) ? Number(body.bizCode) : null
  const message = String(body.message || '').slice(0, 500)
  const detail = typeof body.detail === 'string'
    ? body.detail.slice(0, 6000)
    : JSON.stringify(body.detail || {}).slice(0, 6000)

  // 有 token 就关联用户；登录失效（401）时依旧允许匿名上报，避免日志丢失
  const userId = await getUserIdFromToken(request)
  let username = ''
  if (userId) {
    const row = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()
    username = row?.username || ''
  }

  // 同一用户同一接口同一错误 1 分钟内只记一条，避免前端重试刷屏
  const dup = await env.DB.prepare(
    `SELECT id FROM error_log
     WHERE url = ? AND method = ? AND message = ?
       AND IFNULL(user_id, 0) = IFNULL(?, 0)
       AND create_time >= DATETIME('now', '-1 minute')
     LIMIT 1`,
  ).bind(url, method, message, userId).first()
  if (dup?.id)
    return jsonResp({ code: 200, msg: '重复上报已忽略' })

  await env.DB.prepare(
    `INSERT INTO error_log (user_id, username, url, method, http_status, biz_code, message, detail, status, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', DATETIME('now'))`,
  ).bind(userId, username, url, method, httpStatus, bizCode, message, detail).run()
  return jsonResp({ code: 200, msg: '上报成功' })
}

/**
 * 管理员：错误日志列表 GET /api/admin/error-logs
 * 查询参数：status=all|new|resolved、keyword、from、to、page、pageSize
 */
export async function handleAdminListErrorLogs(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const statusParam = String(url.searchParams.get('status') || 'all')
  const keyword = String(url.searchParams.get('keyword') || '').trim()
  const from = String(url.searchParams.get('from') || '').trim()
  const to = String(url.searchParams.get('to') || '').trim()
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20))

  const conditions = []
  const binds = []
  if (statusParam === 'new' || statusParam === 'resolved') {
    conditions.push(`status = ?`)
    binds.push(statusParam)
  }
  if (keyword) {
    const like = `%${keyword}%`
    conditions.push(`(url LIKE ? OR message LIKE ? OR username LIKE ? OR detail LIKE ?)`)
    binds.push(like, like, like, like)
  }
  if (from) {
    conditions.push(`create_time >= ?`)
    binds.push(from)
  }
  if (to) {
    // 结束时间取当天 23:59:59，避免漏掉最后一天
    conditions.push(`create_time <= ?`)
    binds.push(to.length === 10 ? `${to} 23:59:59` : to)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM error_log ${where}`).bind(...binds).first()
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, username, url, method, http_status, biz_code, message, detail, status, create_time
     FROM error_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, pageSize, (page - 1) * pageSize).all()

  return jsonResp({
    code: 200,
    data: {
      list: results || [],
      total: Number(totalRow?.total) || 0,
      page,
      pageSize,
    },
  })
}

/** 管理员：标记错误日志处理状态 POST /api/admin/error-log/status body: { id, status } */
export async function handleAdminUpdateErrorLogStatus(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  const status = String(body.status || '')
  if (!id || !['new', 'resolved'].includes(status))
    return jsonResp({ code: 400, msg: '参数不完整' })
  await env.DB.prepare('UPDATE error_log SET status = ? WHERE id = ?').bind(status, id).run()
  return jsonResp({ code: 200, msg: status === 'resolved' ? '已标记为已处理' : '已标记为未处理' })
}

/** 管理员：删除单条错误日志 POST /api/admin/error-log/delete body: { id } */
export async function handleAdminDeleteErrorLog(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id)
    return jsonResp({ code: 400, msg: '缺少日志 id' })
  await env.DB.prepare('DELETE FROM error_log WHERE id = ?').bind(id).run()
  return jsonResp({ code: 200, msg: '已删除' })
}

/** 管理员：批量清除错误日志 POST /api/admin/error-log/clear body: { status: 'new' | 'resolved' | 'all' } */
export async function handleAdminClearErrorLogs(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const status = String(body.status || 'resolved')
  if (status === 'all') {
    await env.DB.prepare('DELETE FROM error_log').run()
    return jsonResp({ code: 200, msg: '已清除全部日志' })
  }
  if (status !== 'new' && status !== 'resolved')
    return jsonResp({ code: 400, msg: '参数错误' })
  await env.DB.prepare('DELETE FROM error_log WHERE status = ?').bind(status).run()
  return jsonResp({ code: 200, msg: '已清除所选日志' })
}

/**
 * 添加 / 复用歌曲 POST /api/song/add
 * 以 source_song_id 去重；首次入库时回源音源接口补全封面、歌词、时长等元信息
 */
