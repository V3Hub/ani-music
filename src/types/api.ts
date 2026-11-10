/** 后端统一响应结构（worker 使用 msg，旧接口使用 message） */
export interface ApiResponse<T = unknown> {
  code: number
  msg?: string
  message?: string
  data: T
}

/** 分页数据结构 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
