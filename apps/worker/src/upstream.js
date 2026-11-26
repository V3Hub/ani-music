import { APP_CONFIG } from './config.js'

/**
 * bugu 上游按 Cloudflare 出口 IP 段封禁（返回 200 + 空 body），
 * 配置了 APP_CONFIG.buguProxy 时经反代（Vercel Edge）转发。
 * @param {string} directUrl 上游原始地址
 * @returns {string} 未配置反代时原样返回
 */
function viaProxy(directUrl) {
  const prefix = APP_CONFIG.buguProxy
  if (!prefix) return directUrl
  const key = APP_CONFIG.buguProxyKey
  return `${prefix}${encodeURIComponent(directUrl)}${key ? `&key=${encodeURIComponent(key)}` : ''}`
}

export function buildSongApiUrl(source, id) {
  const rid = encodeURIComponent(id)
  switch (source) {
    case 'netease':
      return `https://api.qijieya.cn/meting/?type=song&id=${rid}`
    case 'mitu':
      return `https://www.qqmp3.vip/api/kw.php?rid=${rid}&type=json&level=exhigh&lrc=true`
    case 'bugu':
      return viaProxy(`https://www.buguyy.top/api/geturl?id=${rid}`)
    default:
      return ''
  }
}

/**
 * 上游搜索接口地址映射
 * @returns {string} 不支持的 source 返回空串
 */
export function buildSearchApiUrl(source, keyword, page, num) {
  const word = encodeURIComponent(keyword)
  switch (source) {
    case 'netease':
      return `https://api.vkeys.cn/v2/music/netease?word=${word}&page=${page}&num=${num}`
    case 'mitu':
      return `https://www.qqmp3.vip/api/songs.php?type=search&keyword=${word}`
    case 'bugu':
      return viaProxy(`https://www.buguyy.top/api/search?keyword=${word}`)
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
