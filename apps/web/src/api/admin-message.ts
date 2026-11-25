import { request } from '@/utils/request'

/** 管理员对某条留言的回复 */
export interface AdminMessageReply {
  id: number
  parent_id: number
  content: string
  create_time: string
}

/** 用户发出的一条留言（含其下回复） */
export interface AdminMessageItem {
  id: number
  content: string
  create_time: string
  replies: AdminMessageReply[]
}

/** 管理员收件箱里的一行 = 一条用户留言 */
export interface AdminInboxItem {
  id: number
  user_id: string
  nickname?: string | null
  avatar_url?: string | null
  username?: string | null
  content: string
  create_time: string
  reply_count: number
  last_reply_time: string
}

/** 管理员查看单条留言详情 */
export interface AdminMessageDetail {
  message: {
    id: number
    user_id: string
    content: string
    create_time: string
    nickname?: string | null
    avatar_url?: string | null
    username?: string | null
  }
  replies: AdminMessageReply[]
}

/** 用户给管理员留言 */
export async function addAdminMessage(content: string): Promise<{ id: number }> {
  return request.post<{ id: number }>('/api/admin/message/add', { content })
}

/** 用户拉取自己的留言列表（每条带管理员回复） */
export async function getMyAdminMessages(): Promise<AdminMessageItem[]> {
  return request.get<AdminMessageItem[]>('/api/admin/messages')
}

/** 管理员：收件箱列表，一行一条用户留言 */
export async function getAdminInbox(keyword = ''): Promise<AdminInboxItem[]> {
  return request.get<AdminInboxItem[]>('/api/admin/inbox', {
    params: keyword ? { keyword } : {},
  })
}

/** 管理员：查看某条留言详情与其回复 */
export async function getAdminMessageDetail(id: number): Promise<AdminMessageDetail> {
  return request.get<AdminMessageDetail>('/api/admin/message/detail', {
    params: { id },
  })
}

/** 用户删除自己的留言（连带管理员回复） */
export async function deleteAdminMessage(id: number): Promise<void> {
  await request.post('/api/admin/message/delete', { id })
}

/** 管理员：回复某条留言 */
export async function replyAdminMessage(messageId: number, content: string): Promise<void> {
  await request.post('/api/admin/inbox/reply', { messageId, content })
}
