// Vercel Serverless Function — 通用 HTTP 反代
// 访问路径：/api/proxy?key=<PROXY_KEY>&target=<encodeURIComponent(目标URL)>
//
// 路由逻辑：
//   - 目标源属于中国 → 用 proxifly/free-proxy-list 的 CN HTTP 代理出网
//   - 目标源不在中国 → 直连
//   - 中国目标代理池空 / 全部失败 → 直接返回 502（无兜底）

const { env: procEnv } = require('node:process')
const { ProxyAgent, fetch: undiciFetch } = require('undici')

const { isChinaTarget } = require('../lib/cn-detector')
const { getProxies, getCacheStats } = require('../lib/proxy-pool')

const REQUEST_TIMEOUT_MS = 15000
const PROXY_MAX_RETRIES = 5 // 池里已预过滤过，5 次足够覆盖偶发失效

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)

  // key 校验
  const expectedKey = procEnv.PROXY_KEY || ''
  if (!expectedKey) {
    return json(res, { code: 500, msg: '服务端未配置 PROXY_KEY' }, 500)
  }
  if ((url.searchParams.get('key') || '') !== expectedKey) {
    return json(res, { code: 401, msg: 'key 校验失败' }, 401)
  }

  const target = url.searchParams.get('target') || ''
  if (!target) {
    return json(res, { code: 400, msg: '缺少 target 参数' }, 400)
  }

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return json(res, { code: 400, msg: 'target 不是合法 URL' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json(res, { code: 400, msg: '仅支持 http/https' }, 400)
  }

  // 判断是否中国目标
  const china = isChinaTarget(target)

  try {
    let upstream
    let usedProxy = null

    if (china) {
      // 中国目标 → 尝试通过代理出网
      const result = await fetchWithProxies(target, parsed)
      upstream = result.response
      usedProxy = result.proxy
    } else {
      // 非中国目标 → 直连
      upstream = await undiciFetch(target, buildRequestOptions(parsed, null))
    }

    const body = new Uint8Array(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    copyHeaders(res, upstream.headers, china ? usedProxy : null)
    res.end(body)
  } catch (err) {
    console.error('[proxy] 请求失败:', parsed.hostname, err.message)
    json(res, { code: 502, msg: '上游请求失败', detail: err.message }, 502)
  }
}

/**
 * 用代理池中的代理依次尝试请求，最多 PROXY_MAX_RETRIES 次
 */
async function fetchWithProxies(target, parsed) {
  const allProxies = await getProxies()
  if (allProxies.length === 0) {
    throw new Error('代理池为空，无法通过代理请求中国目标')
  }

  // 随机打乱顺序，避免总是用同一个代理
  const shuffled = [...allProxies].sort(() => Math.random() - 0.5)

  const errors = []
  for (let i = 0; i < Math.min(PROXY_MAX_RETRIES, shuffled.length); i++) {
    const proxyUrl = shuffled[i]
    const agent = new ProxyAgent(proxyUrl)

    try {
      const response = await undiciFetch(target, buildRequestOptions(parsed, agent))
      console.log(
        `[proxy] OK proxy=${proxyUrl} target=${parsed.hostname} status=${response.status}`,
      )
      return { response, proxy: proxyUrl }
    } catch (err) {
      console.warn(
        `[proxy] FAIL proxy=${proxyUrl} target=${parsed.hostname}: ${err.message}`,
      )
      errors.push(err.message)
    } finally {
      // 主动关闭 agent 释放连接
      try {
        agent.close()
      } catch {
        /* noop */
      }
    }
  }

  throw new Error(`所有代理均失败: ${errors.join(' | ')}`)
}

/**
 * 构造 fetch 请求选项
 */
function buildRequestOptions(parsed, agent) {
  const options = {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': `${parsed.origin}/`,
      'Origin': parsed.origin,
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  }
  if (agent) {
    options.dispatcher = agent
  }
  return options
}

/**
 * 从上游响应复制关键头到下游，附加路由信息头
 */
function copyHeaders(res, upstreamHeaders, usedProxy) {
  const skip = new Set(['transfer-encoding', 'connection', 'keep-alive'])
  for (const [key, value] of upstreamHeaders.entries()) {
    if (skip.has(key.toLowerCase())) continue
    try {
      res.setHeader(key, value)
    } catch {
      /* 某些头 Vercel 不允许覆盖 */
    }
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Proxy-Routed', usedProxy ? `proxy:${usedProxy}` : 'direct')

  // 调试时可以打开
  if (procEnv.DEBUG_PROXY === '1') {
    const stats = getCacheStats()
    res.setHeader('X-Proxy-Pool-Count', String(stats.count))
  }
}

function json(res, obj, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}
