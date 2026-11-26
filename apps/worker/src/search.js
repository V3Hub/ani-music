import { jsonResp } from './http.js'
import { buildSearchApiUrl, buildSongApiUrl } from './upstream.js'

export function normalizeSearchResults(source, data) {
  switch (source) {
    case 'netease':
      return Array.isArray(data?.data)
        ? data.data.map(item => ({
            id: item.id,
            source,
            title: item.song || '',
            pic: item.cover || '',
            singer: item.singer || '',
            album: item.album || '',
          }))
        : []
    case 'mitu':
      return Array.isArray(data?.data)
        ? data.data.map(item => ({
            id: item.rid || '',
            source,
            title: item.name || '',
            pic: item.pic || '',
            singer: item.artist || '',
          }))
        : []
    case 'bugu':
      return Array.isArray(data?.data)
        ? data.data.map(item => ({
            id: item.id || '',
            source,
            title: item.title || '',
            pic: item.picurl || '',
            singer: item.singer || '',
          }))
        : []
    default:
      return []
  }
}

/**
 * 多音源搜索 GET /api/music/search
 * 按 source 请求不同上游接口，并把结果统一成 Song 字段结构
 */
export async function handleSearchMusic(request, _env) {
  const url = new URL(request.url)
  const keyword = url.searchParams.get('keyword')?.trim() || ''
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const num = Math.min(30, Math.max(1, Number(url.searchParams.get('num')) || 10))
  const source = url.searchParams.get('source') || ''
  if (!keyword) {
    return jsonResp({ code: 400, msg: 'keyword 不能为空' })
  }
  const api = buildSearchApiUrl(source, keyword, page, num)
  if (!api) {
    return jsonResp({ code: 400, msg: '不支持的 source' })
  }

  try {
    const fetchRes = await fetch(api, {
      method: 'GET',
      // 经 Vercel 反代的中国源最多要等 18s 竞速，这里给足 25s 预算
      signal: AbortSignal.timeout(25000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(api).origin,
      },
    })
    const data = await fetchRes.json()
    return jsonResp({ code: 200, data: normalizeSearchResults(source, data) })
  } catch (err) {
    console.error('搜索接口异常', { source, keyword, api, err: err.message })
    return jsonResp({ code: 5001, msg: '服务繁忙', data: [] })
  }
}

/**
 * 播放地址 GET /api/song/stream
 * 解析上游直链后 302 跳转（netease 需二次请求拿真实地址）
 */
export async function handleSongStreamRedirect(request, _env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  const source = url.searchParams.get('source') || ''
  if (!id || !source) {
    return jsonResp({ code: 400, msg: '资源不存在' })
  }
  const apiUrl = buildSongApiUrl(source, id)
  if (!apiUrl) {
    return jsonResp({ code: 400, msg: '不支持的 source' })
  }
  let finalUrl = ''
  try {
    const fetchRes = await fetch(apiUrl, {
      // bugu 走 Vercel 反代竞速，最多 18s；给足 25s 避免提前 abort
      signal: AbortSignal.timeout(25000),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(apiUrl).origin,
      },
    })
    const data = await fetchRes.json()
    switch (source) {
      case 'netease': {
        const originUrl = data?.[0]?.url
        const resp = await fetch(originUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': new URL(originUrl).origin,
          },
          signal: AbortSignal.timeout(10000),
          redirect: 'follow',
        })
        finalUrl = resp.url
        break
      }
      case 'mitu':
        finalUrl = data?.data?.url
        break
      case 'bugu':
        finalUrl = data?.url
        break
    }
  } catch (err) {
    console.error('播放地址接口异常', { source, id, apiUrl, err: err.message })
    return jsonResp({ code: 500, msg: '服务繁忙' })
  }
  if (!finalUrl) {
    return jsonResp({ code: 404, msg: '资源不存在' })
  }
  return Response.redirect(finalUrl, 302)
}

/** 收藏列表 GET /api/favorite/list */
