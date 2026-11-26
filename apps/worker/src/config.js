/** 统一响应头（CORS + JSON） */
export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
}

/** 最近播放 / 收藏 / 歌单的最大保存条数 */
export const MAX_PLAYLIST_COUNT = 100

/** 热点榜缓存默认有效期（秒）。wrangler.toml [vars].HOT_CACHE_TTL 可覆盖；范围约束见 getHotCacheTtl */
export const DEFAULT_HOT_CACHE_TTL = 300

/**
 * 运行期可变配置。
 * - secretKey：token 签名 + 密码哈希的统一密钥（**敏感，必需由 env.SECRET_KEY 注入，缺失抛错**）
 * - allowedOrigins：来源白名单（前缀匹配），由 env.ALLOWED_ORIGINS 逗号分隔注入；空数组 = 不限制任何来源
 * - buguProxy：bugu 上游反代前缀（env.BUGU_PROXY）；空串 = 直连上游
 *   反代服务的 key 复用 secretKey（Vercel 侧 PROXY_KEY 配同一个值）
 */
export const APP_CONFIG = {
  secretKey: '',
  allowedOrigins: [],
  buguProxy: '',
}

/**
 * 用环境变量配置 APP_CONFIG：每次 fetch 入口调用（幂等）。
 * SECRET_KEY 缺失 → 抛错终止 Worker；
 * ALLOWED_ORIGINS 缺失 → 保持空数组（放行所有来源）；
 * HOT_CACHE_TTL 缺失 → 由 getHotCacheTtl 单独处理。
 * @param {object} env Worker 环境变量
 */
export function applyEnvOverrides(env) {
  if (!env) return

  // —— 敏感必需项 ——
  if (!env.SECRET_KEY) {
    throw new Error(
      '[config] 缺少必需的 SECRET_KEY。请通过 `npx wrangler secret put SECRET_KEY` 配置。',
    )
  }
  APP_CONFIG.secretKey = String(env.SECRET_KEY)

  // —— 可选项：缺失或格式非法 → 空数组（放行所有来源）——
  APP_CONFIG.allowedOrigins = []
  if (env.ALLOWED_ORIGINS) {
    const list = String(env.ALLOWED_ORIGINS)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (list.length) APP_CONFIG.allowedOrigins = list
  }

  // —— 可选项：bugu 反代前缀，缺失 → 直连上游 ——
  APP_CONFIG.buguProxy = normalizeProxyPrefix(env.BUGU_PROXY)
}

/**
 * 规范化反代前缀：容忍末尾斜杠，自动补全 ?target=
 * @param {unknown} raw 原始环境变量值
 * @returns {string} 空串表示不启用反代
 */
function normalizeProxyPrefix(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (value.includes('?target=')) return value
  return value.includes('?') ? `${value}&target=` : `${value}?target=`
}

/** 读取热点榜缓存 TTL：env 缺失回退 300，非法值收敛到 [10, 3600] */
export function getHotCacheTtl(env) {
  const ttl = Number(env?.HOT_CACHE_TTL)
  if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_HOT_CACHE_TTL
  return Math.min(3600, Math.max(10, Math.floor(ttl)))
}
