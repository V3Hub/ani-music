import { request } from '@/utils/request'

/** 封禁时长选项：days = 0 表示永久 */
export type BanDays = 0 | 7 | 30 | 90 | 180 | 365

export interface AdminUserItem {
  id: number
  /** 用户 id 的 base64 展示串 */
  id_code: string
  username: string
  nickname: string
  avatar_url: string
  is_admin: boolean
  vip_level: number
  status: 'active' | 'banned'
  ban_reason: string
  ban_time: string
  /** 封禁截止时间（UTC），空表示永久 */
  ban_until: string
  /** 注册时间（users.created_at） */
  create_time: string
  last_login_ip: string
}

export interface AdminUserListResp {
  list: AdminUserItem[]
  total: number
  page: number
  pageSize: number
}

export interface AdminIpItem {
  ip: string
  reason: string
  /** 解封时间（UTC），空表示永久 */
  expire_time: string
  create_time: string
  expired: boolean
}

interface UserFilter {
  page?: number
  pageSize?: number
  keyword?: string
  status?: 'active' | 'banned' | 'all'
}

/** 管理员：用户列表 */
export function getAdminUsers(filter: UserFilter = {}) {
  return request.get<AdminUserListResp>('/api/admin/users', { params: filter })
}

/** 管理员：封禁用户（days = 0 永久） */
export function banUser(id: number, reason?: string, days: number = 0) {
  return request.post<void>('/api/admin/user/ban', { id, reason, days })
}

/** 管理员：解封用户 */
export function unbanUser(id: number) {
  return request.post<void>('/api/admin/user/unban', { id })
}

/** 管理员：重置密码，可指定新密码（默认 123456） */
export function resetUserPassword(id: number, password?: string) {
  return request.post<{ password: string }>('/api/admin/user/reset-password', { id, password })
}

/** 管理员：删除用户（级联清理） */
export function deleteUser(id: number) {
  return request.post<void>('/api/admin/user/delete', { id })
}

/** 管理员：IP 黑名单列表 */
export function getIpBlacklist(keyword = '') {
  return request.get<AdminIpItem[]>('/api/admin/ip-blacklist', {
    params: keyword ? { keyword } : {},
  })
}

/** 管理员：拉黑 IP（days = 0 永久） */
export function addIpBlacklist(ip: string, reason?: string, days: number = 0) {
  return request.post<void>('/api/admin/ip-blacklist/add', { ip, reason, days })
}

/** 管理员：移出 IP 黑名单 */
export function removeIpBlacklist(ip: string) {
  return request.post<void>('/api/admin/ip-blacklist/remove', { ip })
}
