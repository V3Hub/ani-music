/**
 * HTTP 客户端 —— axios 实例与全局配置
 *
 * 约定：
 *  - 响应结构统一为 { code, message, data }，code === 0 视为成功
 *  - 请求自动携带 Bearer Token（来自 stores/user）
 *  - 401 清理登录态并回到开屏页重新自动登录，其余错误统一 toast 提示
 */
import type { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import { showToast } from 'vant'
import { useUserStore } from '@/stores/user'
import type { ApiResponse } from '@/types/api'

const SUCCESS_CODE = 200
/** 记录上次重新登录的时间，用于防止自动登录失败时无限刷新 */
const RELOGIN_KEY = 'ain-music:relogin-at'
/** 本次页面生命周期内是否已触发刷新，避免并发 401 重复提示 */
let reloginPending = false

/**
 * 401 处理：回到开屏页重新走自动登录流程
 * 页面 reload 后会重新展示 index.html 的开屏动画，并在 main.ts 里重新获取 token
 */
function relogin() {
  if (reloginPending)
    return
  const last = Number(sessionStorage.getItem(RELOGIN_KEY) || 0)
  // 5 秒内已重登过 —— 说明自动登录失败，不再刷新，避免死循环
  if (Date.now() - last < 5000) {
    showToast('登录失败，请稍后重试')
    return
  }
  reloginPending = true
  sessionStorage.setItem(RELOGIN_KEY, String(Date.now()))
  showToast('登录已过期，正在重新登录…')
  window.setTimeout(() => window.location.reload(), 300)
}

const http: AxiosInstance = axios.create({
  // baseURL 留空：开发环境走 vite /api 代理，生产环境由 .env 写完整域名（不带 /api 后缀）
  // API 文件里统一显式写 /api/xxx 路径
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 10000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // 拦截器回调是懒执行的，此时 Pinia 已就绪
  const token = useUserStore().getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  response => response,
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status
    const message = error.response?.data?.msg || error.response?.data?.message

    if (error.code === 'ECONNABORTED') {
      showToast('请求超时，请检查网络')
    } else if (!status) {
      showToast('网络异常，请稍后重试')
    } else if (status === 401) {
      useUserStore().clearToken()
      relogin()
    } else if (status === 403) {
      showToast('没有访问权限')
    } else if (status === 404) {
      showToast('请求的资源不存在')
    } else if (status >= 500) {
      showToast('服务器开小差了，请稍后再试')
    } else {
      showToast(message || '请求失败')
    }

    return Promise.reject(error)
  },
)

/** 解包后端统一响应结构 */
async function unwrap<T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await request
  if (data.code !== SUCCESS_CODE) {
    const message = data.msg || data.message || '请求失败'
    showToast(message)
    throw new Error(message)
  }
  return data.data
}

export const request = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(http.get<ApiResponse<T>>(url, config)),
  post: <T>(url: string, payload?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.post<ApiResponse<T>>(url, payload, config)),
  put: <T>(url: string, payload?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.put<ApiResponse<T>>(url, payload, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(http.delete<ApiResponse<T>>(url, config)),
}

export default http
