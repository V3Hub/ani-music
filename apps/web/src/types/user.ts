/** 用户信息：头像以 base64 / data URL 形式存储在 users.avatar_url */
export interface UserProfile {
  id: number
  username: string
  nickname: string
  avatar: string
  /** 是否管理员（可进入注册审批页） */
  isAdmin?: boolean
  /** 永久 VIP 等级：0 非会员，1-9 等级 */
  vipLevel?: number
}

/** 登录成功返回：token + 用户资料 */
export interface LoginResult {
  token: string
  user: UserProfile
}

/** 登录命中多个账号时的候选账号 */
export interface LoginCandidate {
  id: number
  username: string
  nickname: string
  avatar: string
  vipLevel: number
}

/** 登录响应：直接成功，或返回候选账号等待选择 */
export type LoginResponse = LoginResult | { needChoose: true, accounts: LoginCandidate[] }

/** 本地保存的可切换账号 */
export interface SavedAccount {
  userId: number
  username: string
  nickname: string
  avatar: string
  token: string
}

/** 注册申请状态 */
export type RegistrationStatus = 'pending' | 'approved' | 'rejected'

/** 注册审批进度（用户侧查询，不含截图与密码） */
export interface RegistrationProgress {
  username: string
  nickname: string
  status: RegistrationStatus
  reject_reason?: string
  create_time: string
  review_time?: string
}

/** 管理员审批列表项 */
export interface RegistrationItem extends RegistrationProgress {
  id: number
  /** 提交申请的 userToken 对应用户 id（必填） */
  user_id: number
  phone?: string
  email?: string
  payment_screenshot?: string
}

/** 注册申请提交参数 */
export interface RegisterPayload {
  username: string
  nickname: string
  password: string
  phone?: string
  email?: string
  paymentScreenshot: string
}
