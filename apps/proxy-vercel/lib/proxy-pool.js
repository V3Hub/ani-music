// proxifly/free-proxy-list CN HTTP 代理池
//
// 设计要点：Vercel 是无状态 Serverless，实例随时冷启动 / 扩容，进程内缓存并不可靠。
// 因此不在请求路径上做「全量探测」——175 个代理跑一遍会让冷启动接近一分钟，调用方必然超时。
// 这里改成「按目标实时竞速」：
//   1. 拉取 proxifly CN 代理原始列表（内存缓存 5 分钟，与上游更新频率一致）
//   2. 打乱后小批量并发请求同一个目标，谁先成功用谁，其余立刻放弃
//   3. 把胜出的代理按目标 host 缓存 30 分钟，后续同类请求优先复用它

const { env: procEnv } = require('node:process')
const { ProxyAgent, fetch: undiciFetch } = require('undici')

/** 原始代理列表缓存时长：proxifly 每 5 分钟更新一次，这里同步 5 分钟 */
const LIST_TTL_MS = 5 * 60 * 1000
/** 单个目标 host 的胜出代理缓存时长 */
const WINNER_TTL_MS = 30 * 60 * 1000

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// 仅保留 CN 代理：实测多国混池会引入大量非中国出口，命中率反而下降
const PROXY_COUNTRIES = ['CN']

/** 每个国家最多取多少候选，避免列表过大 */
const PER_COUNTRY_CAP = 120

// 免费列表里混了不少「TCP 能连但不是 HTTP 代理」的端口（SSH / SOCKS / 数据库等），
// 它们会一直挂到超时才失败，白占样本，直接剔除
const BOGUS_PORTS = new Set([
  21,
  22,
  23,
  25,
  53,
  110,
  143,
  465,
  587,
  993,
  995,
  1080,
  4145,
  3306,
  5432,
  6379,
  27017,
])

// raw.githubusercontent 优先（CDN 缓存约 5 分钟），jsdelivr 的 @main 缓存可达 12h，仅兜底
function listUrls(code) {
  return [
    `https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/${code}/data.json`,
    `https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/${code}/data.json`,
  ]
}

/** 竞速默认参数：整体预算 20s（含拉列表），单代理 10s，每批 30 并发 */
const DEFAULTS = {
  deadlineMs: 20000,
  attemptMs: 10000,
  batchSize: 30,
}

const state = {
  raw: [],
  rawFetchedAt: 0,
  fetching: false,
  lastError: '',
  attempts: 0,
  rotate: 0,
  winners: new Map(),
}

/** 进行中的列表拉取（并发请求共享同一个 Promise） */
let inflight = null

/** 归一化错误描述：区分超时 / 具体系统错误码（undici 把原因包在 err.cause 里） */
function describeError(err) {
  const cause = err && err.cause
  const name = (cause && cause.name) || (err && err.name) || ''
  if (name === 'AbortError' || name === 'TimeoutError')
    return 'timeout'
  const code = (cause && cause.code) || (err && err.code)
  if (code)
    return code
  return (cause && cause.message) || (err && err.message) || 'unknown'
}

/** 把失败原因聚合成 `timeoutx58, ECONNREFUSEDx2` 这种一眼能看的摘要 */
function summarizeErrors(errors) {
  const counts = new Map()
  for (const line of errors) {
    const reason = line.slice(line.lastIndexOf(' ') + 1)
    counts.set(reason, (counts.get(reason) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}x${count}`)
    .join(', ')
}

/** Fisher-Yates 洗牌（返回新数组） */
function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * 用指定代理请求一次目标，读完 body 后立即关闭 agent
 * @returns {Promise<{ status: number, headers: Headers, body: Uint8Array, proxy: string }>} 上游响应
 */
async function attempt(proxyUrl, target, headers, attemptMs) {
  const agent = new ProxyAgent(proxyUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), attemptMs)
  try {
    const res = await undiciFetch(target, {
      dispatcher: agent,
      signal: controller.signal,
      redirect: 'follow',
      headers,
    })
    const body = new Uint8Array(await res.arrayBuffer())
    return { status: res.status, headers: res.headers, body, proxy: proxyUrl }
  } finally {
    clearTimeout(timer)
    agent.close().catch(() => {})
  }
}

/**
 * 并发跑一批请求，第一个成功即返回；全部失败返回 { ok: false, errors }
 * 传入的 Promise 只会 resolve 成 { ok, res } 或 { ok: false, err }，不会 reject
 */
function firstSuccess(promises) {
  return new Promise((resolve) => {
    let pending = promises.length
    const errors = []
    if (pending === 0) {
      resolve({ ok: false, errors })
      return
    }
    for (const promise of promises) {
      promise.then((result) => {
        if (result.ok) {
          resolve(result)
          return
        }
        errors.push(result.err)
        pending -= 1
        if (pending === 0)
          resolve({ ok: false, errors })
      })
    }
  })
}

// 嗅探目标：默认百度首页（可用 env.PROBE_URL 覆盖）
// 注意百度对代理 IP 有拦截，可能产生假阴性
const PROBE_URL = procEnv.PROBE_URL || 'https://www.baidu.com/'
const PROBE_TIMEOUT_MS = 2500
const PROBE_CONCURRENCY = 50
/** 嗅探阶段最多占用多少毫秒，剩下的预算留给竞速 */
const PROBE_BUDGET_MS = 8000

/** 拉取单个国家的代理列表（多源容灾） */
async function fetchCountry(code) {
  let lastError = new Error(`${code} 拉取失败`)
  for (const url of listUrls(code)) {
    try {
      const resp = await undiciFetch(url, {
        headers: { 'User-Agent': UA },
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
      return data
        .filter(p => p
          && (p.protocol === 'http' || p.protocol === 'https')
          && typeof p.ip === 'string'
          && typeof p.port === 'number'
          && p.port > 0
          && p.port < 65536
          && !BOGUS_PORTS.has(p.port))
        .map(p => `${p.protocol}://${p.ip}:${p.port}`)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/** 用单个代理嗅探百度，能拿到任意响应即视为可用 */
async function probeOne(proxyUrl) {
  const agent = new ProxyAgent(proxyUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await undiciFetch(PROBE_URL, {
      dispatcher: agent,
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    })
    return res.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    agent.close().catch(() => {})
  }
}

/** 并发嗅探，只返回能打通百度的代理；到 deadline 提前收工 */
async function probeProxies(list, deadline) {
  const ok = []
  let cursor = 0
  const stopAt = deadline || Infinity

  async function worker() {
    while (cursor < list.length && Date.now() < stopAt) {
      const proxy = list[cursor++]
      if (await probeOne(proxy))
        ok.push(proxy)
    }
  }

  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker))
  return ok
}

/** 按国家优先级合并代理，并用百度嗅探，只有能通的才进池 */
async function buildList(deadline) {
  const countries = PROXY_COUNTRIES

  const groups = await Promise.all(countries.map(code =>
    fetchCountry(code)
      .then(list => shuffle([...new Set(list)]).slice(0, PER_COUNTRY_CAP))
      .catch((err) => {
        console.warn(`[proxy-pool] ${code} 拉取失败: ${err.message}`)
        return []
      }),
  ))

  const seen = new Set()
  const merged = []
  for (const group of groups) {
    for (const proxy of group) {
      if (!seen.has(proxy)) {
        seen.add(proxy)
        merged.push(proxy)
      }
    }
  }

  if (merged.length === 0) {
    console.warn('[proxy-pool] 未取到任何候选代理，沿用旧池')
    return state.raw
  }

  // 先嗅探，只有能打通百度的才算可用代理进池
  const probeDeadline = Math.min(deadline || Infinity, Date.now() + PROBE_BUDGET_MS)
  const verified = await probeProxies(merged, probeDeadline)
  console.info(`[proxy-pool] 国家=${countries.join('/')} 候选=${merged.length} 嗅探通过=${verified.length}`)

  if (verified.length === 0) {
    // 百度会拦截代理 IP，嗅探全挂很可能是假阴性，
    // 此时用未嗅探的候选继续竞速，而不是把池子清空导致直接报「列表为空」
    console.warn('[proxy-pool] 百度嗅探无一通过，回退未嗅探候选')
    const fallbackHttps = merged.filter(p => p.startsWith('https://'))
    const fallbackOthers = merged.filter(p => !p.startsWith('https://'))
    return fallbackHttps.slice(0, 6).concat(fallbackOthers, fallbackHttps.slice(6))
  }

  // https 代理只占队首前 6 个：实测 https 条目大量不可用，全部前置会浪费整批样本
  const https = verified.filter(p => p.startsWith('https://'))
  const others = verified.filter(p => !p.startsWith('https://'))
  return https.slice(0, 6).concat(others, https.slice(6))
}

/** 取原始列表；超过 5 分钟则刷新，刷新失败保留旧值 */
async function getRawList(force = false, deadline) {
  const fresh = state.raw.length > 0 && Date.now() - state.rawFetchedAt < LIST_TTL_MS
  if (!force && fresh)
    return state.raw
  // 并发请求共享同一次拉取，避免冷启动时多个请求各拉一遍
  if (inflight)
    return inflight
  state.fetching = true
  inflight = (async () => {
    try {
      const raw = await buildList(deadline)
      state.raw = raw
      state.rawFetchedAt = Date.now()
      state.lastError = ''
      console.info(`[proxy-pool] 列表已更新 count=${raw.length}`)
    } catch (err) {
      state.lastError = err.message
      console.error('[proxy-pool] 拉取代理列表失败:', err.message)
    } finally {
      inflight = null
      state.fetching = false
    }
    return state.raw
  })()
  return inflight
}

/**
 * 通过 CN 代理竞速请求目标地址
 *
 * @param {string} target 目标 URL
 * @param {object} [options]
 * @param {number} [options.deadlineMs] 整体时间预算
 * @param {number} [options.attemptMs] 单次尝试超时
 * @param {number} [options.batchSize] 每批并发数
 * @param {object} [options.headers] 透传到目标的请求头
 * @param {(status: number) => boolean} [options.accept] 判定响应是否可接受
 * @returns {Promise<{ status: number, headers: Headers, body: Uint8Array, proxy: string }>} 竞速胜出的上游响应
 */
async function raceProxies(target, options = {}) {
  const { deadlineMs, attemptMs, batchSize, headers, accept } = { ...DEFAULTS, ...options }
  const parsed = new URL(target)
  const host = parsed.host
  const isAcceptable = accept || (status => status >= 200 && status < 400)
  const reqHeaders = headers || {
    'User-Agent': UA,
    'Referer': `${parsed.origin}/`,
    'Origin': parsed.origin,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  }

  // 整体预算从进入函数就开始计时，列表拉取也算在内
  const deadline = Date.now() + deadlineMs
  const remainMs = () => deadline - Date.now()

  // 1. 命中缓存的胜出代理 → 单次尝试，省掉竞速开销
  const winner = state.winners.get(host)
  if (winner && Date.now() - winner.ts < WINNER_TTL_MS) {
    try {
      const res = await attempt(winner.proxy, target, reqHeaders, Math.min(attemptMs, Math.max(1000, remainMs())))
      state.attempts += 1
      if (isAcceptable(res.status))
        return res
    } catch {
      // 缓存代理已失效，继续走竞速
    }
    state.winners.delete(host)
  }

  // 2. 竞速：buildList 已按 https 优先 + 国家优先级排好；
  //    每次请求把取样窗口向后轮转一批，避免 5 分钟内反复只试前 30 个
  const raw = await getRawList(false, deadline)
  if (raw.length === 0)
    throw new Error('代理列表为空')
  const slot = Math.max(1, Math.ceil(raw.length / batchSize))
  const offset = (state.rotate++ % slot) * batchSize
  const queue = raw.slice(offset).concat(raw.slice(0, offset))

  const errors = []
  let tried = 0
  let cursor = 0

  while (cursor < queue.length) {
    const remain = remainMs()
    if (remain <= 1000)
      break
    const batch = queue.slice(cursor, cursor + batchSize)
    cursor += batch.length
    const perAttempt = Math.min(attemptMs, remain)

    const result = await firstSuccess(batch.map((proxyUrl) => {
      tried += 1
      return attempt(proxyUrl, target, reqHeaders, perAttempt)
        .then((res) => {
          state.attempts += 1
          if (isAcceptable(res.status))
            return { ok: true, res }
          return { ok: false, err: `${proxyUrl} HTTP ${res.status}` }
        })
        .catch(err => ({
          ok: false,
          err: `${proxyUrl} ${describeError(err)}`,
        }))
    }))

    if (result.ok) {
      state.winners.set(host, { proxy: result.res.proxy, ts: Date.now() })
      console.info(`[proxy-pool] OK host=${host} proxy=${result.res.proxy} status=${result.res.status}`)
      return result.res
    }
    errors.push(...result.errors)
  }

  throw new Error(`代理竞速失败（尝试 ${tried} 个: ${summarizeErrors(errors)}）示例: ${errors.slice(0, 2).join(' | ')}`)
}

function getCacheStats() {
  return {
    listCount: state.raw.length,
    listAgeMs: state.rawFetchedAt ? Date.now() - state.rawFetchedAt : null,
    fetching: state.fetching,
    lastError: state.lastError,
    attempts: state.attempts,
    winners: state.winners.size,
  }
}

module.exports = {
  raceProxies,
  getRawList,
  getCacheStats,
  LIST_TTL_MS,
}
