/** 用户信息：头像以 base64 / data URL 形式存储在 users.avatar_url */
export interface UserProfile {
  id: number
  username: string
  nickname: string
  avatar: string
}

/** 登录成功返回：token + 用户资料 */
export interface LoginResult {
  token: string
  user: UserProfile
}
