import { requireActiveUser } from './auth.js'
import { APP_CONFIG } from './config.js'
import { jsonResp } from './http.js'

export const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SHARE_PAYLOAD_LEN = 4
export const SHARE_SIG_LEN = 2
export const SHARE_PAYLOAD_SPACE = 62 ** SHARE_PAYLOAD_LEN
export const SHARE_SIG_SPACE = 62 ** SHARE_SIG_LEN
export const SHARE_TOKEN_PATTERN = new RegExp(`^[0-9A-Z]{${SHARE_PAYLOAD_LEN + SHARE_SIG_LEN}}$`, 'i')

export function encodeBase62(num, length) {
  let rest = num
  let result = ''
  while (rest > 0) {
    result = SHARE_ALPHABET[rest % 62] + result
    rest = Math.floor(rest / 62)
  }
  return result.padStart(length, '0')
}

export async function getShareHmacKey() {
  // 与登录 token 共用 SECRET_KEY，加后缀做用途隔离
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${APP_CONFIG.secretKey}:share`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export async function signSharePayload(key, payload) {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const bytes = new Uint8Array(signature)
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return encodeBase62(num % SHARE_SIG_SPACE, SHARE_SIG_LEN)
}

export async function createShareToken(type, id) {
  // 末位区分类型，song / playlist 互不通用
  const value = id * 2 + (type === 'playlist' ? 1 : 0)
  if (value <= 0 || value >= SHARE_PAYLOAD_SPACE)
    return null
  const payload = encodeBase62(value, SHARE_PAYLOAD_LEN)
  const key = await getShareHmacKey()
  return payload + (await signSharePayload(key, payload))
}

export async function parseShareToken(token) {
  if (!token || !SHARE_TOKEN_PATTERN.test(token))
    return null
  const payload = token.slice(0, SHARE_PAYLOAD_LEN)
  const key = await getShareHmacKey()
  if ((await signSharePayload(key, payload)) !== token.slice(SHARE_PAYLOAD_LEN))
    return null
  let value = 0
  for (const char of payload) {
    const index = SHARE_ALPHABET.indexOf(char)
    if (index < 0)
      return null
    value = value * 62 + index
  }
  const id = Math.floor(value / 2)
  if (!id)
    return null
  return { type: value % 2 ? 'playlist' : 'song', id }
}

/** 生成分享 token GET /api/share/token?type=song&id=1 */
export async function handleCreateShareToken(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const id = Number(url.searchParams.get('id'))
  if ((type !== 'song' && type !== 'playlist') || !id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const token = await createShareToken(type, id)
  if (!token) {
    return jsonResp({ code: 400, msg: '分享 id 超出范围' })
  }
  return jsonResp({ code: 200, msg: '获取分享 token 成功', data: { token } })
}

/** 解析分享 token GET /api/share/resolve?token=xx */
export async function handleResolveShareToken(request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const parsed = await parseShareToken(token)
  if (!parsed) {
    return jsonResp({ code: 400, msg: '分享链接无效或已失效' })
  }
  return jsonResp({ code: 200, msg: '解析分享 token 成功', data: parsed })
}

/**
 * 分享人数统计表（需手动执行建表 SQL）：
 * 歌曲与歌单共用一张表，target_type 区分 song / playlist，
 * 按 (类型, id, user_id) 去重，一个用户分享同一条内容只算一人
 */

/** 查询歌曲分享人数 GET /api/song/share?id=1 */
export async function handleGetSongShareCount(request, env) {
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'song\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '获取分享人数成功', data: { count: row?.count || 0 } })
}

/** 记录一次分享 POST /api/song/share { id }：返回最新分享人数 */
export async function handleReportSongShare(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const id = Number(body && body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  await env.DB.prepare('INSERT OR IGNORE INTO share_user (target_type, target_id, user_id, create_time) VALUES (\'song\', ?, ?, DATETIME(\'now\'))')
    .bind(id, String(userId))
    .run()
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'song\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '分享记录成功', data: { count: row?.count || 0 } })
}

/** 查询歌单分享人数 GET /api/playlist/share?id=1 */
export async function handleGetPlaylistShareCount(request, env) {
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'playlist\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '获取分享人数成功', data: { count: row?.count || 0 } })
}

/** 记录一次歌单分享 POST /api/playlist/share { id }：返回最新分享人数 */
export async function handleReportPlaylistShare(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const id = Number(body && body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  await env.DB.prepare('INSERT OR IGNORE INTO share_user (target_type, target_id, user_id, create_time) VALUES (\'playlist\', ?, ?, DATETIME(\'now\'))')
    .bind(id, String(userId))
    .run()
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'playlist\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '分享记录成功', data: { count: row?.count || 0 } })
}

/**
 * 歌曲评论表（需手动执行建表 SQL）：
 * 回复统一挂在顶层评论下（parent_id 指向顶层），只保留一层结构
 */
