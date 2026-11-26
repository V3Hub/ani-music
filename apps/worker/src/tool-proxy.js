import { APP_CONFIG } from './config.js'
import { jsonResp } from './http.js'

/**
 * 工具接口：GET /api/tool/proxy?url=<目标地址>
 * 经 Vercel 反代出网并原样回传内容（借其出口 IP 访问被机房 IP 封禁的上游）。
 * 需登录；PROXY_URL 未配置时直接报错。
 */
export async function handleToolProxy(request) {
  const target = new URL(request.url).searchParams.get('url') || ''
  if (!target) return jsonResp({ code: 400, msg: 'url 不能为空' })

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return jsonResp({ code: 400, msg: 'url 不是合法地址' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonResp({ code: 400, msg: '仅支持 http/https' })
  }

  const base = APP_CONFIG.proxyUrl
  if (!base) return jsonResp({ code: 500, msg: '未配置 PROXY_URL' })

  const upstream = new URL(base)
  upstream.searchParams.set('key', APP_CONFIG.secretKey)
  upstream.searchParams.set('target', target)

  try {
    // Vercel 侧中国目标竞速预算 18s，这里给 25s
    const res = await fetch(upstream.toString(), { signal: AbortSignal.timeout(25000) })
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    })
  } catch (err) {
    console.error('[tool-proxy] 反代请求失败', { target, err: err.message })
    return jsonResp({ code: 502, msg: '反代请求失败' }, 502)
  }
}
