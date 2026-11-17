/**
 * 密码工具 —— 与 Worker 端保持同一套哈希规则
 *
 * 应用不开放注册，账号由管理员在 users 表中创建：
 *   password 字段填写本工具生成的存储值（SHA-256(密码 + 固定盐) 十六进制）
 */

export const PASSWORD_SALT = 'ani-music'

/** 生成密码存储值，与 Worker 登录校验保持一致 */
export async function hashPassword(password: string) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password + PASSWORD_SALT),
  )
  return Array.from(new Uint8Array(buf))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** 生成随机强密码（去掉易混淆字符） */
export function randomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, value => chars[value % chars.length]).join('')
}
