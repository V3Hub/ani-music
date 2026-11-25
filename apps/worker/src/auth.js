import { APP_CONFIG } from './config.js'
import { jsonResp } from './http.js'

/**
 * 生成用户 token：base64(userId) + SHA-256(userId + SECRET_KEY) 签名
 * 同一 userId 每次生成的 token 都一致，便于直接复用
 */
export async function generateToken(userId) {
  const payload = `${userId}`
  const payloadB64 = btoa(payload)
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payload + APP_CONFIG.secretKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const signHex = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${payloadB64}.${signHex}`
}
/**
 * 从 Authorization: Bearer <token> 中解析并校验用户 id
 * @returns {Promise<number|null>} 格式非法 / 签名不匹配时返回 null
 */
export async function getUserIdFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '').trim()
  const tokenParts = token.split('.')
  if (tokenParts.length !== 2) return null
  const [payloadB64, clientSign] = tokenParts
  let payloadRaw
  try {
    payloadRaw = atob(payloadB64)
  } catch {
    return null
  }
  const userId = parseInt(payloadRaw)
  if (Number.isNaN(userId)) return null
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payloadRaw + APP_CONFIG.secretKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const serverSign = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  if (serverSign !== clientSign) return null
  return userId
}
/** 判定是否为正常浏览器请求：UA 为空或命中爬虫关键字时返回 false */
export function isHumanRequest(request) {
  const ua = (request.headers.get('user-agent') ?? '').toLowerCase()
  const botList = [
    'spider',
    'crawler',
    'scrapy',
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
  ]
  if (!ua) return false
  return !botList.some(w => ua.includes(w))
}
/** 判定来源是否允许：allowedOrigins 为空数组时表示不限制来源 */
export function isAllowedReferer(request) {
  const ref = request.headers.get('referer')
  if (!ref) return false
  // 白名单为空 = 未启用来源限制，放行所有来源
  if (!APP_CONFIG.allowedOrigins.length) return true
  return APP_CONFIG.allowedOrigins.some(w => ref.startsWith(w))
}
/** 统一 JSON 响应：自动带上 CORS 头与指定状态码 */
export const userAliveCache = new Map()
export const USER_ALIVE_TTL = 5 * 60 * 1000
export const USER_ALIVE_MAX = 1000

/**
 * 校验 token 中的 userId 在 users 表里是否仍然存在
 * 定时任务会清理长期未活跃用户，被清理用户的旧 token 签名仍然合法，
 * 这里补一次存在性校验，避免其写入孤儿数据；结果做短期缓存降低 D1 读取次数
 */
export async function isUserAlive(DB, userId) {
  const seenAt = userAliveCache.get(userId)
  if (seenAt && Date.now() - seenAt < USER_ALIVE_TTL) return true

  const row = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first()
  if (!row?.id) {
    userAliveCache.delete(userId)
    return false
  }
  if (userAliveCache.size >= USER_ALIVE_MAX) userAliveCache.clear()
  userAliveCache.set(userId, Date.now())
  return true
}

/**
 * 读取客户端真实 IP：Cloudflare 环境优先 CF-Connecting-IP，其次取 X-Forwarded-For 首个
 */
export function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return ''
}

/** 当前 UTC 时间字符串，格式与 SQLite DATETIME('now') 一致，便于直接字符串比较 */
export function nowUtcString() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** 封禁截止时间是否仍然有效：空值表示永久封禁 */
export function isBanActive(banUntil) {
  if (!banUntil) return true
  return String(banUntil) > nowUtcString()
}

/** 封禁提示后缀：永久 /（至 2026-02-01 12:00） */
export function formatBanUntil(banUntil) {
  if (!banUntil) return '（永久）'
  return `（至 ${String(banUntil).slice(0, 16)}）`
}

/**
 * 校验当前请求 IP 是否在 IP 黑名单中且未过期。
 * 命中返回该行（含 reason / expire_time），否则返回 null；表不存在时静默放行。
 */
export async function findIpBan(env, ip) {
  if (!ip) return null
  try {
    return await env.DB.prepare(
      `SELECT ip, reason, expire_time FROM ip_blacklist
       WHERE ip = ? AND (expire_time IS NULL OR expire_time = '' OR expire_time > DATETIME('now'))
       LIMIT 1`,
    ).bind(ip).first()
  } catch {
    // 未执行建表 SQL 时不影响正常访问
    return null
  }
}

/** 当前请求已校验的 userId：fetch 入口写入，业务方法按需读取，避免层层传参 */
export const requestUserIds = new WeakMap()

/** 取当前请求的 userId（全局已校验，必定存在） */
export function getRequestUserId(request) {
  return requestUserIds.get(request) ?? null
}

/**
 * 校验当前登录用户是否处于 active 状态。
 * 返回 { userId, errResp }；errResp 有值时表示用户未登录 / 已封禁，handler 应直接 return errResp。
 * 仅需要拦截写操作（发帖、留言、改资料、改密码、点赞、收藏、歌单管理、通知操作）。
 */
export async function requireActiveUser(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return { userId: null, errResp: jsonResp({ code: 401, msg: '请先登录' }, 401) }
  }
  const row = await env.DB.prepare(
    `SELECT COALESCE(status, 'active') AS status, ban_reason, ban_until FROM users WHERE id = ?`,
  ).bind(userId).first()
  if (!row) {
    return { userId: null, errResp: jsonResp({ code: 401, msg: '账号不存在' }, 401) }
  }
  if (row.status === 'banned' && isBanActive(row.ban_until)) {
    return {
      userId: null,
      errResp: jsonResp({
        code: 403,
        msg: `账号已被封禁${formatBanUntil(row.ban_until)}`,
        data: { reason: row.ban_reason || '', banUntil: row.ban_until || '' },
      }, 403),
    }
  }
  // 限时封禁已到期：顺手恢复，避免状态长期停在 banned
  if (row.status === 'banned') {
    await env.DB.prepare(
      `UPDATE users SET status = 'active', ban_reason = '', ban_until = NULL WHERE id = ?`,
    ).bind(userId).run()
  }
  return { userId, errResp: null }
}

export async function requireAdmin(request, env) {
  const userId = await getUserIdFromToken(request)
  if (!userId)
    return null
  const row = await env.DB.prepare('SELECT id, is_admin FROM users WHERE id = ?').bind(userId).first()
  if (!row?.id || !row.is_admin)
    return null
  return row.id
}

/** 管理员：用户列表 GET /api/admin/users?page=&pageSize=&keyword=&status=active|banned|all */
