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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(api).origin,
      },
      // 跨第三方域名不启用 CF 缓存：cacheEverything 会把 gzip 等响应流
      // 按自己的方式处理，偶发 response.json() 无法解析
    })
    let data
    try {
      data = await fetchRes.json()
    } catch {
      // 兜底：转成 text 再手动 parse，并把前 200 字打到日志
      const text = await fetchRes.text().catch(() => '')
      console.warn('[search] json() 失败，回退手动 parse', {
        source,
        keyword,
        content_type: fetchRes.headers.get('content-type'),
        body_head: text.slice(0, 200),
      })
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`上游返回非标准JSON数据：${text.slice(0, 120)}`)
      }
    }
    return jsonResp({ code: 200, data: normalizeSearchResults(source, data) })
  } catch (err) {
    console.error('接口异常', { source, keyword, api, err: err.message })
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
  let data
  let upstream = null
  try {
    const fetchRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(apiUrl).origin,
      },
    })
    const raw = await fetchRes.text().catch(() => '')
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
    upstream = { status: fetchRes.status, ct: fetchRes.headers.get('content-type'), head: raw.slice(0, 160) }
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
    return jsonResp({ code: 500, msg: `服务繁忙: ${err.message}` })
  }
  if (!finalUrl) {
    // TEMP-DEBUG: 上游异常时回传诊断信息，定位后移除
    return jsonResp({ code: 404, msg: `资源不存在`, data, upstream })
  }
  return Response.redirect(finalUrl, 302)
}

/** 收藏列表 GET /api/favorite/list */
