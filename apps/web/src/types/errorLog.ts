/** 错误日志处理状态：new 未处理 / resolved 已处理 */
export type ErrorLogStatus = 'new' | 'resolved'

/** 接口错误日志条目 */
export interface ErrorLogItem {
  id: number
  user_id?: number | null
  username?: string
  /** 出错接口路径 */
  url: string
  method: string
  /** HTTP 状态码（业务错误为 200） */
  http_status: number
  /** 后端业务 code */
  biz_code?: number | null
  message?: string
  /** JSON 字符串：请求参数 / 响应体 / 页面 / 客户端时间 */
  detail?: string
  status: ErrorLogStatus
  create_time: string
}

/** 管理员查询错误日志参数 */
export interface ErrorLogQuery {
  status?: 'all' | ErrorLogStatus
  keyword?: string
  /** 起始日期（YYYY-MM-DD） */
  from?: string
  /** 结束日期（YYYY-MM-DD） */
  to?: string
  page?: number
  pageSize?: number
}
