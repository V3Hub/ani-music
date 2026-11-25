/**
 * 站内消息通知 API —— 列表 / 未读数 / 标记已读
 *
 * 未读数维护在一个响应式 ref 里，任何组件 mark/delete 后都会自动刷新，
 * OwnerPanel、Tabbar 等订阅该状态即可保持角标一致。
 */
import type { PageResult } from '@/types/api'
import type { UserNotification } from '@/types/notification'
import { request } from '@/utils/request'
import { ref } from 'vue'

/** 全局未读通知数：OwnerPanel、Tabbar 直接订阅这个 ref */
export const unreadCount = ref(0)

let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** 刷新未读数（防抖 300ms，避免连续 mark 时多次请求） */
export function refreshUnreadCount() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => {
    try {
      const data = await request.get<{ count: number }>('/api/notification/unread')
      unreadCount.value = Number(data?.count) || 0
    } catch {
      // 刷新失败不影响页面展示
    }
  }, 300)
}

/** 清空未读数（登出时调用） */
export function resetUnreadCount() {
  unreadCount.value = 0
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

/** 通知列表（按时间倒序分页）；box=inbox 收到的 / box=outbox 我发出的 */
export async function getNotifications(page = 1, pageSize = 20, box: 'inbox' | 'outbox' = 'inbox'): Promise<PageResult<UserNotification>> {
  return request.get<PageResult<UserNotification>>('/api/notification/list', { params: { page, pageSize, box } })
}

/** 未读通知数（兼容旧组件，优先使用全局 unreadCount） */
export async function getUnreadNotificationCount(): Promise<number> {
  const data = await request.get<{ count: number }>('/api/notification/unread')
  const count = Number(data?.count) || 0
  unreadCount.value = count
  return count
}

/** 标记已读：传 id 标记单条，不传标记全部 */
export async function markNotificationsRead(id?: number): Promise<number> {
  const data = await request.post<{ count: number }>('/api/notification/read', id ? { id } : {})
  refreshUnreadCount()
  return Number(data?.count) || 0
}

/** 删除通知：传 id 删单条；scope='read' 清空已读；scope='all' 清空全部（仅自己收到的） */
export async function deleteNotifications(id?: number, scope?: 'read' | 'all'): Promise<number> {
  const body: Record<string, unknown> = {}
  if (id) body.id = id
  else if (scope === 'read') body.read = 1
  else if (scope === 'all') body.all = 1
  const data = await request.post<{ count: number }>('/api/notification/delete', body)
  refreshUnreadCount()
  return Number(data?.count) || 0
}
