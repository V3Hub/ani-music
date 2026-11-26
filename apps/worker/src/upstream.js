import { APP_CONFIG } from './config.js'

/**
 * bugu 上游按 Cloudflare / Vercel 出口 IP 段封禁，
 * 通过 Vercel 反代出网（反代内部用 proxifly CN 代理 + 中国 IP）。
 * 未配置 proxyUrl 时回退直连（会被封，仅调试用）。
 *
 * 注意：directUrl 保持未编码状态（query 值也不 encodeURIComponent），
 * 这里用 encodeURIComponent(directUrl) 只编码一次，
 * 避免 searchParams.set 二次编码 %（会把已有 %3D 变成 %253D）。
 * @param {string} directUrl 上游原始地址（query 值未编码）
 * @returns {string} 包好 key 与 target 参数的反代地址
 */
function viaProxy(directUrl) {
  const base = APP_CONFIG.proxyUrl
  if (!base) return directUrl
  const key = APP_CONFIG.secretKey
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}key=${encodeURIComponent(key)}&target=${encodeURIComponent(directUrl)}`
}

export function buildSongApiUrl(source, id) {
  switch (source) {
    case 'netease': {
      const rid = encodeURIComponent(id)
      return `https://api.qijieya.cn/meting/?type=song&id=${rid}`
    }
    case 'mitu': {
      const rid = encodeURIComponent(id)
      return `https://www.qqmp3.vip/api/kw.php?rid=${rid}&type=json&level=exhigh&lrc=true`
    }
    case 'bugu':
      // bugu 路径不预编码，让 viaProxy 一次性 encode 整个 URL
      return viaProxy(`https://www.buguyy.top/api/geturl?id=${id}`)
    default:
      return ''
  }
}

/**
 * 上游搜索接口地址映射
 * @returns {string} 不支持的 source 返回空串
 */
export function buildSearchApiUrl(source, keyword, page, num) {
  switch (source) {
    case 'netease': {
      const word = encodeURIComponent(keyword)
      return `https://api.vkeys.cn/v2/music/netease?word=${word}&page=${page}&num=${num}`
    }
    case 'mitu': {
      const word = encodeURIComponent(keyword)
      return `https://www.qqmp3.vip/api/songs.php?type=search&keyword=${word}`
    }
    case 'bugu':
      // bugu 路径不预编码，让 viaProxy 一次性 encode 整个 URL
      return viaProxy(`https://www.buguyy.top/api/search?keyword=${keyword}`)
    default:
      return ''
  }
}

/**
 * 数据库歌曲行 → 前端统一 Song 结构
 * 默认只返回列表所需的基础信息，不含歌词与收藏状态：
 * 歌词、收藏都在歌曲开始播放时通过 /api/song/detail 拉取
 * @param {object} item 查询结果行
 * @param {{ withLyric?: boolean, withFavorite?: boolean }} [options]
 */
