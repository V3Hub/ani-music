import { requireActiveUser } from './auth.js'
import { mapSongRow } from './db.js'
import { jsonResp } from './http.js'
import { buildSongApiUrl } from './upstream.js'

export async function handleUpsertSong(request, env) {
  const body = await request.json().catch(() => ({}))
  const { lrc = '', pic = '', singer = '', title = '', source = '', id = '', album = '' } = body
  if (!source || !String(title).trim()) {
    return jsonResp({ code: 400, msg: 'source、title 不能为空' })
  }
  const DB = env.DB

  // 已入库直接复用
  const existRow = await DB.prepare(
    `SELECT id, title, artist, cover_url, audio_url, lyric, album FROM songs WHERE source_song_id = ?`,
  )
    .bind(String(id))
    .first()
  if (existRow?.id) {
    return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(existRow) })
  }

  // 首次入库：回源补全元信息（失败则沿用请求参数）
  const apiUrl = buildSongApiUrl(source, id)
  const fetchUrl = `https://musapi.v3hub.site/api/song/stream?source=${source}&id=${encodeURIComponent(id)}`
  let fetchLrc = lrc
  let fetchPic = pic
  let duration = 0
  let fetchAlbum = album
  let genre = ''
  let releaseTime = null
  if (apiUrl) {
    try {
      const upstream = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(apiUrl).origin,
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      })
        .then(res => res.json())
        .catch(() => null)
      if (upstream) {
        switch (source) {
          case 'netease': {
            const lrcRes = await fetch(upstream[0].lrc, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(upstream[0].lrc).origin,
              },
              cf: { cacheTtl: 60, cacheEverything: true },
            })
            fetchLrc = await lrcRes.text().catch(() => null)
            break
          }
          case 'qq':
            fetchPic = upstream?.album_pic
            fetchLrc = upstream?.song_lyric
            duration = Number(upstream?.song_play_time || 0)
            fetchAlbum = upstream?.album_name || ''
            genre = upstream?.genre || ''
            releaseTime = upstream?.public_time || null
            break
          case 'mitu':
            fetchLrc = upstream?.data?.lrc
            break
        }
      }
    } catch (fetchErr) {
      console.error('音源接口请求失败：', source, apiUrl, fetchErr)
    }
  }

  const insertResult = await DB.prepare(`
    INSERT INTO songs
    (title, artist, cover_url, audio_url, lyric, duration, album, genre, release_time, source_song_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      String(title).trim(),
      String(singer).trim(),
      fetchPic,
      fetchUrl,
      fetchLrc,
      duration,
      fetchAlbum,
      genre,
      releaseTime,
      String(id),
    )
    .run()

  const inserted = {
    id: insertResult.meta.last_row_id,
    title: String(title).trim(),
    artist: String(singer).trim(),
    cover_url: fetchPic,
    audio_url: fetchUrl,
    lyric: fetchLrc,
    duration,
    album: fetchAlbum,
    publish_time: releaseTime,
  }
  return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(inserted) })
}
/**
 * 听歌模式排序策略：切换模式时前端会带着 mode 重新请求热门推荐，
 * 这里按模式调整「最热歌曲」的打分，让榜单与听歌模式联动。
 *  - default：默认热度榜，听过的歌降权
 *  - familiar：熟悉模式，收藏 / 常听歌手加权，听过的歌不再降权
 *  - fresh：新鲜模式，听过的歌重罚，新歌与新鲜度加权
 *  - library / emo / dj / sleep：在热度基础上偏好对应曲风
 */
export async function handleGetSongDetail(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return jsonResp({ code: 400, msg: '资源不存在' })
  }
  const DB = env.DB
  const results = await DB.prepare(
    `
    SELECT
      s.*,
      CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END AS favorite,
      (SELECT COUNT(*) FROM user_favorite fv WHERE fv.song_id = s.id) AS favorite_count
    FROM songs s
    LEFT JOIN user_favorite f ON f.user_id = ? AND f.song_id = s.id
    WHERE s.id = ?
  `,
  )
    .bind(userId, id)
    .first()
  if (!results) {
    return jsonResp({ code: 404, msg: '歌曲不存在' })
  }
  return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(results, { withLyric: true, withFavorite: true }) })
}

/** 规范化标签文本：压缩空白并限制长度，非法时返回空串 */
