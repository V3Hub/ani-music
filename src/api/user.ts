/**
 * 自动登录 —— 基于浏览器指纹向后端换取临时 token。
 *
 * 特性：
 *   - 已有 token 或正在请求中时安全复用（幂等 + 防并发）
 *   - 指纹生成 / 网络失败只 warn，不阻塞应用启动
 *   - 拿到 token 写入 user store，后续 request 拦截器自动带上
 */
import { getThumbmark } from '@thumbmarkjs/thumbmarkjs'
import { useUserStore } from '@/stores/user'
import { request } from '@/utils/request'

let pendingBootstrap: Promise<string | null> | null = null

export function ensureAutoToken(): Promise<string | null> {
  const userStore = useUserStore()

  // 已有 token —— 直接跳过
  const existing = userStore.getToken()
  if (existing)
    return Promise.resolve(existing)

  // 并发复用 —— 避免重复打接口
  if (pendingBootstrap)
    return pendingBootstrap

  pendingBootstrap = (async () => {
    try {
      const { thumbmark } = await getThumbmark()
      // 后端 /api/user/auto 直接返回 token 字符串
      const token = await request.post<string>('/api/user/auto', { fingerprint: thumbmark })
      if (!token)
        return null
      userStore.setToken(token)
      return token
    } catch (err) {
      console.warn('[user] 自动登录失败，跳过', err)
      return null
    } finally {
      pendingBootstrap = null
    }
  })()

  return pendingBootstrap
}
