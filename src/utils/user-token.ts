/**
 * userToken / 游客占位常量 —— 统一从这里导出，避免到处散落 'guest' / '游客' 字面量。
 */

/** 未登录 / 未识别用户的 userToken 占位 */
export const GUEST_USER_TOKEN = 'guest'

/** 未登录 / 未识别用户的默认显示名（中文 UI 用「游客」） */
export const DEFAULT_DISPLAY_NAME = '游客'

/** 后端返回的 user_id 转成与 token 前半段一致的 userToken（base64） */
export function toUserToken(userId?: number): string {
  return userId != null ? btoa(String(userId)) : GUEST_USER_TOKEN
}

/** 反向：从 userToken 解析出 user_id，解析失败返回 NaN */
export function fromUserToken(userToken?: string): number {
  if (!userToken || userToken === GUEST_USER_TOKEN)
    return NaN
  try {
    return Number(atob(userToken))
  } catch {
    return NaN
  }
}

/**
 * 统一的用户展示名解析。
 * 优先级：nickname → username → userId 的 userToken → 占位。
 * 适用场景：评论作者、歌单作者、我的页等。
 */
export interface DisplayNameInput {
  nickname?: string | null
  username?: string | null
  /** 用户 id（数字）或 userId 字符串（评论里存的是字符串） */
  userId?: number | string | null
  userToken?: string | null
}

export function resolveDisplayName(input: DisplayNameInput): string {
  if (input.nickname)
    return input.nickname
  if (input.username)
    return input.username
  if (input.userId != null && input.userId !== '') {
    const id = Number(input.userId)
    if (Number.isFinite(id))
      return toUserToken(id)
    return String(input.userId)
  }
  if (input.userToken && input.userToken !== GUEST_USER_TOKEN)
    return input.userToken
  return DEFAULT_DISPLAY_NAME
}
