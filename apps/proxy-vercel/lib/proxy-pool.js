// proxifly/free-proxy-list CN HTTP 代理池
// 从 GitHub 仓库拉取中国区代理列表，做内存缓存 + TTL 更新

const { env: procEnv } = require('node:process')

// proxifly 每 5 分钟更新一次，缓存 TTL 稍短一点
const CACHE_TTL_MS = 4 * 60 * 1000 // 4 分钟

// 优先用 jsdelivr CDN（比 raw.githubusercontent.com 更快、更稳）
const PROXY_SOURCES = [
  'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/CN/data.json',
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/CN/data.json',
]

// 模块级缓存（Vercel Serverless Function 同一次冷启动内复用）
let cache = {
  proxies: [], // 可用代理列表，每项形如 "http://ip:port"
  lastFetch: 0, // 上次拉取时间戳
  fetching: false, // 是否正在拉取（避免并发多次请求）
}

/**
 * 从 proxifly 拉取最新 CN 代理列表
 * @returns {Promise<string[]>} 代理 URL 数组，如 ["http://1.2.3.4:8080", ...]
 */
async function fetchFromProxifly() {
  let lastError = null

  for (const url of PROXY_SOURCES) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ani-music-proxy-vercel/1.0' },
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

      // 只保留 http / https 协议的代理（Node.js fetch + undici 支持）
      // score 越高表示越好，优先保留 score >= 1 的
      const httpProxies = data
        .filter(
          p =>
            p
            && (p.protocol === 'http' || p.protocol === 'https')
            && typeof p.ip === 'string'
            && typeof p.port === 'number'
            && p.port > 0
            && p.port < 65536,
        )
        .map(p => `${p.protocol}://${p.ip}:${p.port}`)

      // 去重
      const unique = [...new Set(httpProxies)]
      return unique
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('所有代理源均拉取失败')
}

/**
 * 获取可用的 CN HTTP 代理列表（自动走缓存 + TTL 刷新）
 * @param {boolean} force - 是否强制刷新缓存
 * @returns {Promise<string[]>}
 */
async function getProxies(force = false) {
  const now = Date.now()

  // 缓存有效且不强制刷新 → 直接返回
  if (!force && cache.proxies.length > 0 && now - cache.lastFetch < CACHE_TTL_MS) {
    return cache.proxies
  }

  // 如果已经有其他请求在拉取，直接用现有缓存（不阻塞）
  if (cache.fetching) {
    if (cache.proxies.length > 0) {
      return cache.proxies
    }
    // 没缓存且正在拉取 —— 等它完
    const poll = () =>
      new Promise((resolve) => {
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
    const proxies = await fetchFromProxifly()
    cache.proxies = proxies
    cache.lastFetch = now
    return proxies
  } catch (err) {
    // 拉取失败 → 保留旧缓存（如果有的话）
    console.error('[proxy-pool] 拉取代理列表失败:', err.message)
    return cache.proxies // 可能是空数组
  } finally {
    cache.fetching = false
  }
}

/**
 * 随机挑选一个代理
 * @returns {Promise<string|null>} 代理 URL，没有可用代理时返回 null
 */
async function pickProxy() {
  const proxies = await getProxies()
  if (proxies.length === 0) return null

  // 简单随机
  const idx = Math.floor(Math.random() * proxies.length)
  return proxies[idx]
}

/**
 * 获取缓存统计（用于日志/调试）
 */
function getCacheStats() {
  return {
    count: cache.proxies.length,
    lastFetch: cache.lastFetch ? new Date(cache.lastFetch).toISOString() : null,
    ageMs: cache.lastFetch ? Date.now() - cache.lastFetch : null,
    fetching: cache.fetching,
  }
}

// 可配置：通过环境变量覆盖 TTL（方便调试）
const OVERRIDE_TTL = parseInt(procEnv.PROXY_POOL_TTL_MS, 10)
if (!Number.isNaN(OVERRIDE_TTL) && OVERRIDE_TTL > 0) {
  // 动态覆盖：直接修改模块常量

  module.exports._CACHE_TTL_MS = OVERRIDE_TTL
}

module.exports = {
  getProxies,
  pickProxy,
  getCacheStats,
  // 导出内部常量方便测试
  CACHE_TTL_MS,
}
