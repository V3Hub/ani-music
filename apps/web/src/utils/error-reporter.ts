/**
 * 接口错误上报
 *
 * 约定：
 *  - 只上报服务端明确返回的错误（HTTP 异常状态码 / 业务 code !== 200）
 *  - 断网、超时、主动取消等用户自身网络问题一律不上报
 *  - 敏感字段（密码 / token / 截图 / 头像）脱敏后再落库，长文本截断
 *  - 同一错误 1 分钟去重、单页面生命周期最多上报 MAX_REPORTS 条，避免刷屏
 *  - 用原生 fetch 上报，且不经过 axios 实例，避免上报失败引发递归上报
 */
import type { AxiosError } from 'axios'
import { useUserStore } from '@/stores/user'

const REPORT_PATH = '/api/error-log/report'
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
/** 单页面生命周期内最多上报条数 */
const MAX_REPORTS = 20
/** 相同错误去重时间窗 */
const DEDUPE_WINDOW = 60 * 1000
/** 单个字段最大长度 */
const FIELD_LIMIT = 1500

let reportCount = 0
const reportedKeys = new Map<string, number>()

export interface ApiErrorReport {
  url: string
  method: string
  /** HTTP 状态码；业务错误固定为 200 */
  httpStatus: number
  /** 后端业务 code */
  bizCode?: number | null
  message: string
  /** 请求参数（config.data / 查询参数） */
  requestPayload?: unknown
  /** 响应体 */
  responseBody?: unknown
}

/** 判定是否为用户自身网络问题：断网、超时、主动取消都不应上报 */
export function isNetworkError(error: AxiosError) {
  if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'ERR_CANCELED')
    return true
  return !error.response
}

/** 长文本截断，避免 base64 等大字段撑爆单行 */
function truncate(value: string) {
  return value.length > FIELD_LIMIT ? `${value.slice(0, FIELD_LIMIT)}…` : value
}

/** 递归脱敏：密码 / token / 截图 / 头像等敏感字段直接替换，其余截断 */
function sanitize(value: unknown, depth = 0): unknown {
  if (value == null)
    return value
  if (typeof value === 'string')
    return truncate(value)
  if (typeof value === 'number' || typeof value === 'boolean')
    return value
  if (depth >= 3)
    return '[deep]'
  if (Array.isArray(value))
    return value.slice(0, 10).map(item => sanitize(item, depth + 1))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = /password|token|secret|screenshot|avatar/i.test(key)
        ? '[redacted]'
        : sanitize(item, depth + 1)
    }
    return result
  }
  return String(value)
}

/** 请求体是 JSON 字符串时先解析再脱敏，普通字符串直接截断 */
function normalizeBody(value: unknown) {
  if (typeof value === 'string') {
    try {
      return sanitize(JSON.parse(value))
    } catch {
      return truncate(value)
    }
  }
  return sanitize(value)
}

/** 上报一条接口错误，失败静默 */
export function reportApiError(input: ApiErrorReport) {
  const url = (input.url || '').split('?')[0]
  // 空地址或上报接口自身失败时不再上报，避免循环
  if (!url || url.includes(REPORT_PATH) || reportCount >= MAX_REPORTS)
    return

  const method = (input.method || 'GET').toUpperCase()
  const bizCode = input.bizCode ?? null
  const key = `${method} ${url} ${input.httpStatus} ${bizCode ?? ''} ${input.message}`
  const now = Date.now()
  if (now - (reportedKeys.get(key) || 0) < DEDUPE_WINDOW)
    return
  reportedKeys.set(key, now)
  reportCount += 1

  const detail = JSON.stringify({
    request: normalizeBody(input.requestPayload),
    response: normalizeBody(input.responseBody),
    page: `${location.pathname}${location.search}`,
    clientTime: new Date().toISOString(),
  }).slice(0, 6000)

  const payload = {
    url,
    method,
    httpStatus: input.httpStatus,
    bizCode,
    message: input.message,
    detail,
  }

  let token = ''
  try {
    token = useUserStore().getToken() || ''
  } catch {
    // Pinia 未就绪时匿名上报
  }

  fetch(`${API_BASE}${REPORT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // 上报失败不打扰用户
  })
}
