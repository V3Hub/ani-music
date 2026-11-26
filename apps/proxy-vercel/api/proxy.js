// Vercel Serverless Function — 通用 HTTP 反代
// 访问路径：/api/proxy?key=<PROXY_KEY>&target=<encodeURIComponent(目标URL)>
//
// 路由逻辑：
//   - 目标源属于中国 → 从 proxifly CN 代理池实时竞速，用中国 IP 出网
//   - 目标源不在中国 → 直连
//   - 代理全部失败 → 502（不静默兜底直连，避免被目标源按机房 ASN 封禁）
//
// 超时预算：本函数整体 < 20s，调用方（Cloudflare Worker）超时 25s。

const { env: procEnv } = require('node:process')
const { fetch: undiciFetch } = require('undici')

const { isChinaTarget } = require('../lib/cn-detector')
const { raceProxies, getCacheStats } = require('../lib/proxy-pool')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DIRECT_TIMEOUT_MS = 15000
const PROXY_DEADLINE_MS = 20000
const PROXY_ATTEMPT_MS = 10000
const PROXY_BATCH_SIZE = 30

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)

  // key 校验
  const expectedKey = procEnv.PROXY_KEY || ''
  if (!expectedKey)
    return json(res, { code: 500, msg: '服务端未配置 PROXY_KEY' }, 500)
  if ((url.searchParams.get('key') || '') !== expectedKey)
    return json(res, { code: 401, msg: 'key 校验失败' }, 401)

  const target = url.searchParams.get('target') || ''
  if (!target)
    return json(res, { code: 400, msg: '缺少 target 参数' }, 400)

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return json(res, { code: 400, msg: 'target 不是合法 URL' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return json(res, { code: 400, msg: '仅支持 http/https' }, 400)

  const china = isChinaTarget(target)

  try {
    const result = china
      ? await raceProxies(target, {
          deadlineMs: PROXY_DEADLINE_MS,
          attemptMs: PROXY_ATTEMPT_MS,
          batchSize: PROXY_BATCH_SIZE,
          headers: buildHeaders(parsed),
        })
      : await fetchDirect(target, parsed)

    res.statusCode = result.status
    copyHeaders(res, result.headers, result.proxy)
    res.end(result.body)
  } catch (err) {
    console.error('[proxy] 请求失败:', parsed.hostname, err.message)
    json(res, { code: 502, msg: '上游请求失败', detail: err.message }, 502)
  }
}

/** 直连上游（非中国目标） */
async function fetchDirect(target, parsed) {
  const res = await undiciFetch(target, {
    method: 'GET',
    headers: buildHeaders(parsed),
    signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    redirect: 'follow',
  })
  const body = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, body, proxy: null }
}

/** 伪装成真实浏览器请求上游 */
function buildHeaders(parsed) {
  return {
    'User-Agent': UA,
    'Referer': `${parsed.origin}/`,
    'Origin': parsed.origin,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
  }
}

/**
 * 从上游响应复制关键头到下游，附加路由信息头
 *
 * 注意：body 已被 undici 解压，必须丢弃 content-encoding / content-length，
 * 否则调用方会按 gzip 再次解码而失败（表现为 response.json() 报错）
 */
function copyHeaders(res, upstreamHeaders, usedProxy) {
  const skip = new Set([
    'transfer-encoding',
    'connection',
    'keep-alive',
    'content-encoding',
    'content-length',
  ])
  for (const [key, value] of upstreamHeaders.entries()) {
    if (skip.has(key.toLowerCase()))
      continue
    try {
      res.setHeader(key, value)
    } catch {
      // 某些头 Vercel 不允许覆盖
    }
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Proxy-Routed', usedProxy ? `proxy:${usedProxy}` : 'direct')

  if (procEnv.DEBUG_PROXY === '1')
    res.setHeader('X-Proxy-Pool', JSON.stringify(getCacheStats()))
}

function json(res, obj, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}
