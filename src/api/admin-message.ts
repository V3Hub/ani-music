import { request } from '@/utils/request'

export interface AdminMessageItem {
  id: number
  content: string
  from_admin: number
  create_time: string
  admin_nickname?: string | null
  admin_avatar?: string | null
}

export interface AdminInboxItem {
  user_id: string
  nickname?: string | null
  avatar_url?: string | null
  username?: string | null
  content: string
  from_admin: number
  last_time: string
  unread_count: number
  total: number
}

/** 用户给管理员留言 */
export async function addAdminMessage(content: string): Promise<{ id: number }> {
  return request.post<{ id: number }>('/api/admin/message/add', { content })
}

/** 用户拉取自己与管理员的完整对话 */
export async function getAdminMessages(): Promise<AdminMessageItem[]> {
  return request.get<AdminMessageItem[]>('/api/admin/messages')
}

/** 管理员：收件箱列表，每个用户一组 */
export async function getAdminInbox(keyword = ''): Promise<AdminInboxItem[]> {
  return request.get<AdminInboxItem[]>('/api/admin/inbox', {
    params: keyword ? { keyword } : {},
  })
}

/** 管理员：回复某个用户 */
export async function replyAdminMessage(userId: string, content: string): Promise<void> {
  await request.post('/api/admin/inbox/reply', { userId, content })
}
