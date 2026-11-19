/** 接口错误日志 —— 用户端上报由 utils/error-reporter 负责，这里只提供管理员接口 */
import type { PageResult } from '@/types/api'
import type { ErrorLogItem, ErrorLogQuery, ErrorLogStatus } from '@/types/errorLog'
import { request } from '@/utils/request'

/** 管理员：错误日志列表（分页） */
export function getAdminErrorLogs(query: ErrorLogQuery = {}) {
  return request.get<PageResult<ErrorLogItem>>('/api/admin/error-logs', { params: query })
}

/** 管理员：标记单条日志处理状态 */
export function updateErrorLogStatus(id: number, status: ErrorLogStatus) {
  return request.post<null>('/api/admin/error-log/status', { id, status })
}

/** 管理员：删除单条日志 */
export function deleteErrorLog(id: number) {
  return request.post<null>('/api/admin/error-log/delete', { id })
}

/** 管理员：批量清除日志（按状态，all 为全部） */
export function clearErrorLogs(status: ErrorLogStatus | 'all') {
  return request.post<null>('/api/admin/error-log/clear', { status })
}
