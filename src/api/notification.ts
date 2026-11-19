/**
 * 站内消息通知 API —— 列表 / 未读数 / 标记已读
 */
import type { PageResult } from '@/types/api'
import type { UserNotification } from '@/types/notification'
import { request } from '@/utils/request'

/** 通知列表（按时间倒序分页） */
export async function getNotifications(page = 1, pageSize = 20): Promise<PageResult<UserNotification>> {
  return request.get<PageResult<UserNotification>>('/api/notification/list', { params: { page, pageSize } })
}

/** 未读通知数（「我的」页铃铛角标用） */
export async function getUnreadNotificationCount(): Promise<number> {
  const data = await request.get<{ count: number }>('/api/notification/unread')
  return Number(data?.count) || 0
}

/** 标记已读：传 id 标记单条，不传标记全部 */
export async function markNotificationsRead(id?: number): Promise<number> {
  const data = await request.post<{ count: number }>('/api/notification/read', id ? { id } : {})
  return Number(data?.count) || 0
}
