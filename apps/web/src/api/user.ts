/**
 * 自动登录 —— 基于浏览器指纹向后端换取临时 token。
 *
 * 特性：
 *   - 已有 token 或正在请求中时安全复用（幂等 + 防并发）
 *   - 指纹生成 / 网络失败只 warn，不阻塞应用启动
 *   - 拿到 token 写入 user store，后续 request 拦截器自动带上
 */
import { getThumbmark } from '@thumbmarkjs/thumbmarkjs'
import { useUserStore } from '@/stores/user'
import type { LoginResponse, RegisterPayload, RegistrationItem, RegistrationProgress, UserProfile } from '@/types/user'
import { request } from '@/utils/request'

let pendingBootstrap: Promise<string | null> | null = null

/** 账号密码登录：account 支持用户名 / 手机号 / 邮箱；命中多个账号时传 userId 指定登录哪一个 */
export function login(account: string, password: string, userId?: number) {
  return request.post<LoginResponse>('/api/user/login', { account, password, userId })
}

/** 提交会员注册申请（含付款截图 base64），待管理员审批 */
export function register(payload: RegisterPayload) {
  return request.post<null>('/api/user/register', payload)
}

/** 查询注册审批进度：默认按当前 userToken，传入 username 时按用户名查询 */
export function getRegisterStatus(username?: string) {
  return request.get<RegistrationProgress | null>('/api/user/register/status', {
    params: username ? { username } : {},
  })
}

/** 管理员：注册申请列表 */
export interface AdminRegistrationQuery {
  status?: string
  keyword?: string
  /** 起始日期（YYYY-MM-DD 或完整时间） */
  from?: string
  /** 结束日期（YYYY-MM-DD 或完整时间） */
  to?: string
}

export function getAdminRegistrations(query: string | AdminRegistrationQuery = 'pending') {
  const params = typeof query === 'string'
    ? { status: query }
    : { status: 'pending', ...query }
  return request.get<RegistrationItem[]>('/api/admin/registrations', { params })
}

/** 管理员：审批通过 / 拒绝 */
export function reviewRegistration(id: number, action: 'approve' | 'reject', rejectReason?: string) {
  return request.post<null>('/api/admin/registration/review', { id, action, rejectReason })
}

/** 管理员：调整用户 VIP 等级（1-9），变更自动写入 vip_record */
export function setUserVipLevel(username: string, level: number, remark?: string) {
  return request.post<{ userId: number, vipLevel: number }>('/api/admin/user/vip-level', { username, level, remark })
}

/** VIP 变更记录条目 */
export interface VipRecord {
  id: number
  from_level: number
  to_level: number
  change_type: string
  remark?: string
  create_time: string
}

/** 管理员：查询用户 VIP 变更记录 */
export function getUserVipRecords(username: string) {
  return request.get<VipRecord[]>('/api/admin/user/vip-records', { params: { username } })
}

/** 当前登录用户资料：昵称 + 头像（base64） */
export function getUserProfile() {
  return request.get<UserProfile>('/api/user/profile')
}

/** 修改当前用户资料：用户名 / 昵称 / 头像（base64），未传的字段保持原值 */
export function updateUserProfile(payload: { username?: string, nickname?: string, avatar?: string }) {
  return request.post<UserProfile>('/api/user/profile', payload)
}

/** 修改当前用户密码：需校验原密码 */
export function changePassword(payload: { oldPassword: string, newPassword: string }) {
  return request.post<null>('/api/user/password', payload)
}

/** 他人公开资料（不含手机号 / 邮箱等隐私信息） */
export interface PublicUserProfile {
  id: number
  nickname: string
  avatar: string
  vipLevel: number
  isAdmin: boolean
  /** 是否是当前登录用户自己 */
  mine: boolean
  commentCount: number
  wishCount: number
  playlistCount: number
}

/** 查看其他用户公开资料 */
export function getPublicUserProfile(id: string | number) {
  return request.get<PublicUserProfile>('/api/user/public-profile', { params: { id } })
}

/** 给其他用户留言（同时写入双方的留言记录） */
export function sendUserMessage(userId: string | number, content: string) {
  return request.post<{ id: number } | null>('/api/user/message', { userId, content })
}

/** 双方留言记录中的一条回复 */
export interface UserMessageReply {
  id: number
  parent_id: number
  from_user_id: string
  content: string
  create_time: string
}

/** 一条顶层留言（含其下回复） */
export interface UserMessageItem {
  id: number
  from_user_id: string
  content: string
  create_time: string
  replies: UserMessageReply[]
}

/** 拉取我和某人的留言记录 */
export function getUserMessages(userId: string | number) {
  return request.get<UserMessageItem[]>('/api/user/messages', { params: { userId } })
}

/** 回复别人给你的留言 */
export function replyUserMessage(messageId: number, content: string) {
  return request.post<null>('/api/user/message/reply', { messageId, content })
}

/** 删除自己发出的留言（连带回复） */
export function deleteUserMessage(id: number) {
  return request.post<null>('/api/user/message/delete', { id })
}

export function ensureAutoToken(): Promise<string | null> {
  const userStore = useUserStore()

  // 已有 token —— 直接跳过
  const existing = userStore.getToken()
  if (existing)
    return Promise.resolve(existing)

  // 并发复用 —— 避免重复打接口
  if (pendingBootstrap)
    return pendingBootstrap

  pendingBootstrap = (async () => {
    try {
      const { thumbmark } = await getThumbmark()
      // 后端 /api/user/auto 直接返回 token 字符串
      const token = await request.post<string>('/api/user/auto', { fingerprint: thumbmark })
      if (!token)
        return null
      userStore.setToken(token)
      return token
    } catch (err) {
      console.warn('[user] 自动登录失败，跳过', err)
      return null
    } finally {
      pendingBootstrap = null
    }
  })()

  return pendingBootstrap
}
