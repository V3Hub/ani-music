// proxifly/free-proxy-list CN HTTP 代理池
// 从 GitHub 拉取中国区代理 → 并发探测可用性 → 只保留可用代理进池

const { ProxyAgent, fetch: undiciFetch } = require('undici')
const { Buffer } = require('node:buffer')

// 代理池缓存 2 小时刷新一次
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

// 探测 URL：百度首页（最稳定的中国站点，200 + body 非空即算代理可用）
const PROBE_URL = 'https://www.baidu.com/'
const PROBE_TIMEOUT_MS = 4000 // 单个代理探测超时
const PROBE_CONCURRENCY = 8 // 并发探测数
const MIN_WORKING = 5 // 最少保留数量，低于此值直接用原始列表兜底

// 优先 jsdelivr CDN
const PROXY_SOURCES = [
  'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/CN/data.json',
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/CN/data.json',
]

const cache = {
  proxies: [], // 已验证可用的代理列表
  lastFetch: 0,
  fetching: false,
  totalFetched: 0, // 本次拉到的原始数量（调试）
  probePassed: 0, // 探测通过数量（调试）
}

async function fetchFromProxifly() {
  let lastError = null
  for (const url of PROXY_SOURCES) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) {
        lastError = new Error(`HTTP ${resp.status}`)
        continue
      }
      const data = await resp.json()
      if (!Array.isArray(data)) {
        lastError = new Error('响应不是数组')
        continue
      }

      const list = data
        .filter(p => p && (p.protocol === 'http' || p.protocol === 'https')
          && typeof p.ip === 'string' && typeof p.port === 'number'
          && p.port > 0 && p.port < 65536)
        .map(p => `${p.protocol}://${p.ip}:${p.port}`)
      return [...new Set(list)]
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('所有代理源均拉取失败')
}

/**
 * 并发探测代理可用性 —— 每个代理用 undici ProxyAgent 去访问一个中国接口
 */
async function probeProxies(rawList) {
  if (rawList.length === 0) return []

  const sem = { count: PROBE_CONCURRENCY }
  const results = []
  let idx = 0

  async function worker() {
    while (idx < rawList.length) {
      const i = idx++
      const p = rawList[i]
      try {
        const agent = new ProxyAgent(p)
        const r = await undiciFetch(PROBE_URL, {
          dispatcher: agent,
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        const buf = Buffer.from(await r.arrayBuffer())
        agent.close().catch(() => {})
        if (r.ok && buf.length > 50) {
          results.push(p)
        }
      } catch {
        // fail fast, ignore
      }
    }
  }

  const workers = Array.from({ length: sem.count }, worker)
  await Promise.all(workers)
  return results
}

async function getProxies(force = false) {
  const now = Date.now()

  if (!force && cache.proxies.length > 0 && now - cache.lastFetch < CACHE_TTL_MS) {
    return cache.proxies
  }

  if (cache.fetching) {
    if (cache.proxies.length > 0) return cache.proxies
    const poll = () => new Promise((resolve) => {
      const check = () => {
        if (!cache.fetching) resolve(cache.proxies)
        else setTimeout(check, 100)
      }
      check()
    })
    return poll()
  }

  cache.fetching = true
  try {
    const raw = await fetchFromProxifly()
    cache.totalFetched = raw.length
    const working = await probeProxies(raw)
    cache.probePassed = working.length

    if (working.length >= MIN_WORKING) {
      cache.proxies = working
    } else {
      // 探测通过太少 —— 可能是探测 URL 临时挂了，用原始列表兜底
      console.warn(`[proxy-pool] 探测通过 ${working.length}/${raw.length} 太少，回退原始列表`)
      cache.proxies = raw
    }
    cache.lastFetch = now
    console.info(`[proxy-pool] fetched=${raw.length} probe_ok=${working.length} pool=${cache.proxies.length}`)
    return cache.proxies
  } catch (err) {
    console.error('[proxy-pool] 拉取代理失败:', err.message)
    return cache.proxies
  } finally {
    cache.fetching = false
  }
}

async function pickProxy() {
  const proxies = await getProxies()
  if (proxies.length === 0) return null
  return proxies[Math.floor(Math.random() * proxies.length)]
}

function getCacheStats() {
  return {
    count: cache.proxies.length,
    lastFetch: cache.lastFetch ? new Date(cache.lastFetch).toISOString() : null,
    ageMs: cache.lastFetch ? Date.now() - cache.lastFetch : null,
    fetching: cache.fetching,
    totalFetched: cache.totalFetched,
    probePassed: cache.probePassed,
  }
}

module.exports = {
  getProxies,
  pickProxy,
  getCacheStats,
  CACHE_TTL_MS,
}
