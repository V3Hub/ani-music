/** 统一响应头（CORS + JSON） */
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
}
/** token 签名密钥，与前端的鉴权约定保持一致 */
const SECRET_KEY = 'musapi.v3hub.site'
/** 最近播放 / 收藏 / 歌单的最大保存条数 */
const MAX_PLAYLIST_COUNT = 100

/**
 * 生成用户 token：base64(userId) + SHA-256(userId + SECRET_KEY) 签名
 * 同一 userId 每次生成的 token 都一致，便于直接复用
 */
async function generateToken(userId) {
  const payload = `${userId}`
  const payloadB64 = btoa(payload)
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payload + SECRET_KEY)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const signHex = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${payloadB64}.${signHex}`
}
/**
 * 从 Authorization: Bearer <token> 中解析并校验用户 id
 * @returns {Promise<number|null>} 格式非法 / 签名不匹配时返回 null
 */
async function getUserIdFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '').trim()
  const tokenParts = token.split('.')
  if (tokenParts.length !== 2) return null
  const [payloadB64, clientSign] = tokenParts
  let payloadRaw
  try {
    payloadRaw = atob(payloadB64)
  } catch {
    return null
  }
  const userId = parseInt(payloadRaw)
  if (Number.isNaN(userId)) return null
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payloadRaw + SECRET_KEY)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const serverSign = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  if (serverSign !== clientSign) return null
  return userId
}
/** 判定是否为正常浏览器请求：UA 为空或命中爬虫关键字时返回 false */
function isHumanRequest(request) {
  const ua = (request.headers.get('user-agent') ?? '').toLowerCase()
  const botList = [
    'spider',
    'crawler',
    'scrapy',
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
  ]
  if (!ua) return false
  return !botList.some(w => ua.includes(w))
}
/** 判定来源是否允许：仅本站域名与本地开发环境 */
function isAllowedReferer(request) {
  const ref = request.headers.get('referer')
  if (!ref) return false
  const allowDomain = [
    'https://v3hub.cc.cd',
    'https://53hub.cc.cd',
    'https://v3hub.site',
    'https://music.ani.l.cd',
    'http://localhost',
    'http://199.28.',
  ]
  return allowDomain.some(w => ref.startsWith(w))
}
/** 统一 JSON 响应：自动带上 CORS 头与指定状态码 */
function jsonResp(data, status = 200) {
  return Response.json(data, { headers, status })
}

/**
 * 上游歌曲接口地址映射：加歌与取播放地址共用
 * @returns {string} 不支持的 source 返回空串
 */
function buildSongApiUrl(source, id) {
  const rid = encodeURIComponent(id)
  switch (source) {
    case 'netease':
      return `https://api.qijieya.cn/meting/?type=song&id=${rid}`
    case 'qq':
      return `https://tang.api.s01s.cn/music_open_api.php?mid=${rid}`
    case 'mitu':
      return `https://www.qqmp3.vip/api/kw.php?rid=${rid}&type=json&level=exhigh&lrc=true`
    default:
      return ''
  }
}

/**
 * 上游搜索接口地址映射
 * @returns {string} 不支持的 source 返回空串
 */
function buildSearchApiUrl(source, keyword, page, num) {
  const word = encodeURIComponent(keyword)
  switch (source) {
    case 'netease':
      return `https://api.vkeys.cn/v2/music/netease?word=${word}&page=${page}&num=${num}`
    case 'qq':
      return `https://tang.api.s01s.cn/music_open_api.php?msg=${word}&type=json`
    case 'mitu':
      return `https://www.qqmp3.vip/api/songs.php?type=search&keyword=${word}`
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
function mapSongRow(item, options = {}) {
  const song = {
    id: item.id,
    singer: item.artist || '',
    title: item.title || '',
    url: item.audio_url || '',
    pic: item.cover_url || '',
    duration: item.duration || 0,
    album: item.album || '',
    publishTime: item.publish_time || '',
  }
  if (options.withLyric) song.lrc = item.lyric || ''
  if (options.withFavorite) {
    song.favorite = Boolean(item.favorite)
    song.favoriteCount = Number(item.favorite_count) || 0
  }
  return song
}

/**
 * 往「用户歌曲列表」追加一条：超过上限时先淘汰 sort 最小（最早）的一条
 * @param {object} DB D1 数据库实例
 * @param {'user_play_record'|'user_favorite'} table 内部固定表名
 * @param {number} userId 用户 id
 * @param {number} total 当前条数
 */
async function trimOldestIfFull(DB, table, userId, total) {
  if (total < MAX_PLAYLIST_COUNT) return
  await DB.prepare(`DELETE FROM ${table} WHERE user_id = ? ORDER BY sort ASC LIMIT 1`).bind(userId).run()
}

/** 路由表：path → method → 处理函数，统一由 fetch 分发 */
const ROUTES = {
  '/api/user/auto': { POST: handleAutoLogin },
  '/api/song/add': { POST: handleUpsertSong },
  '/api/play/report': { POST: handleReportPlay },
  '/api/recommend/hot': { GET: handleGetHotList },
  '/api/playRecord/list': { GET: handleGetRecentPlay },
  '/api/playRecord/add': { POST: handleAddRecentPlay },
  '/api/playRecord/remove': { POST: handleRemoveRecentPlay },
  '/api/music/search': { GET: handleSearchMusic },
  '/api/song/stream': { GET: handleSongStreamRedirect },
  '/api/favorite/list': { GET: handleGetFavorites },
  '/api/favorite/add': { POST: handleAddFavorite },
  '/api/favorite/remove': { POST: handleRemoveFavorite },
  '/api/playlist/owner': { GET: handleGetMyPlaylists },
  '/api/playlist/create': { POST: handleCreatePlaylist },
  '/api/subPlaylist/create': { POST: handleSubscribePlaylist },
  '/api/playlist/delete': { POST: handleDeletePlaylist },
  '/api/subPlaylist/delete': { POST: handleUnsubscribePlaylist },
  '/api/playlist/detail': { GET: handleGetPlaylistDetail },
  '/api/playlist/add-song': { POST: handleAddPlaylistSong },
  '/api/playlist/sort-song': { POST: handleSortPlaylistSongs },
  '/api/playlist/remove-song': { POST: handleRemovePlaylistSong },
  '/api/playlist/discover': { GET: handleGetDiscoverPlaylists },
  '/api/song/detail': { GET: handleGetSongDetail },
  '/api/song/theme-color': { GET: handleGetSongThemeColor },
}

/** 免 token 白名单：自动登录；播放直链跳转（audio 元素请求无法携带 Authorization 头） */
const PUBLIC_PATHS = new Set([
  '/api/user/auto',
  '/api/song/stream',
])

/** 已确认存在的用户 id 缓存：userId → 校验时间戳（isolate 内存，5 分钟有效） */
const userAliveCache = new Map()
const USER_ALIVE_TTL = 5 * 60 * 1000
const USER_ALIVE_MAX = 1000

/**
 * 校验 token 中的 userId 在 users 表里是否仍然存在
 * 定时任务会清理长期未活跃用户，被清理用户的旧 token 签名仍然合法，
 * 这里补一次存在性校验，避免其写入孤儿数据；结果做短期缓存降低 D1 读取次数
 */
async function isUserAlive(DB, userId) {
  const seenAt = userAliveCache.get(userId)
  if (seenAt && Date.now() - seenAt < USER_ALIVE_TTL) return true

  const row = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first()
  if (!row?.id) {
    userAliveCache.delete(userId)
    return false
  }
  if (userAliveCache.size >= USER_ALIVE_MAX) userAliveCache.clear()
  userAliveCache.set(userId, Date.now())
  return true
}

/** 当前请求已校验的 userId：fetch 入口写入，业务方法按需读取，避免层层传参 */
const requestUserIds = new WeakMap()

/** 取当前请求的 userId（全局已校验，必定存在） */
function getRequestUserId(request) {
  return requestUserIds.get(request) ?? null
}

export default {
  /**
   * Worker 入口：先做爬虫与来源校验、token 校验，再按 path + method 分发到各业务方法
   */
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers })
    }
    if (!isHumanRequest(request)) return jsonResp({ code: 403, msg: '禁止爬虫访问' }, 403)
    if (!isAllowedReferer(request)) return jsonResp({ code: 403, msg: '非法请求来源' }, 403)

    const path = new URL(request.url).pathname
    const isPublicPath = PUBLIC_PATHS.has(path)
    let userId = null
    try {
      // 除免 token 接口、内部任务外，其余接口都必须携带有效 token，且用户仍然存在
      if (!isPublicPath && !path.startsWith('/internal/')) {
        userId = await getUserIdFromToken(request)
        if (!userId) return jsonResp({ code: 401, msg: '登录状态已失效，请重新登录' }, 401)
        if (!(await isUserAlive(env.DB, userId)))
          return jsonResp({ code: 401, msg: '账号已失效，请重新登录' }, 401)
        // 写入当前请求上下文，业务方法用 getRequestUserId 直接读取
        requestUserIds.set(request, userId)
      }

      // 业务接口：查路由表统一分发
      const handler = ROUTES[path]?.[request.method]
      if (handler) return await handler(request, env)

      // 手动执行统计任务接口
      if (path === '/internal/run-hot-stat-task' && request.method === 'GET') {
        await this.scheduled(null, env, ctx)
        return jsonResp({ code: 200, msg: '请求成功' })
      }
      return jsonResp({ code: 404, msg: '接口不存在' }, 404)
    } catch (e) {
      // 打印完整错误信息+堆栈，日志里就能看到真实原因
      console.error('【全局500异常】', e.message, '\n堆栈：', e.stack)
      return jsonResp({ code: 500, msg: '服务器内部错误' }, 500)
    }
  },
  /** 定时任务：重算歌曲热度榜、清理 30 天未活跃用户与 90 天前播放记录 */
  async scheduled(event, env, _ctx) {
    const DB = env.DB
    try {
      await DB.prepare(`DELETE FROM hot_song_stat;`).run()
      await DB.prepare(
        `
      INSERT INTO hot_song_stat (song_id, week_plays, day_plays)
      SELECT
        song_id,
        COUNT(*) AS week_plays,
        0 AS day_plays
      FROM play_records
      WHERE play_time >= DATETIME(DATE('now', '-6 day', '+8 hour'))
      GROUP BY song_id;
    `,
      ).run()

      await DB.prepare(
        `
      UPDATE hot_song_stat
      SET day_plays = COALESCE((
        SELECT COUNT(*)
        FROM play_records pr
        WHERE pr.song_id = hot_song_stat.song_id
          AND play_time >= DATETIME(DATE('now', '-1 day', '+8 hour'))
          AND play_time < DATETIME(DATE('now', '+8 hour'))
      ), 0);
    `,
      ).run()

      await DB.prepare(
        `
      DELETE FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM play_records
        WHERE play_time >= DATETIME(DATE('now', '-30 day', '+8 hour'))
      );
    `,
      ).run()

      await DB.prepare(
        `
        DELETE FROM play_records
        WHERE play_time < DATETIME(DATE('now', '-90 day', '+8 hour'));
      `,
      ).run()
    } catch (err) {
      console.error('【定时任务异常】', err.message, err.stack)
    }
  },
}

/**
 * 自动登录 POST /api/user/auto
 * 优先复用请求携带的有效 token，其次按 IP + 指纹匹配老用户，最后才新建用户
 */
async function handleAutoLogin(request, env) {
  const DB = env.DB

  // 1. 请求已带 token：校验签名并确认用户仍存在，直接复用（避免换 IP 后重复建号）
  const authHeader = request.headers.get('Authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim()
    const tokenUserId = await getUserIdFromToken(request)
    if (tokenUserId) {
      const row = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(tokenUserId).first()
      if (row?.id) {
        return jsonResp({ code: 200, data: token })
      }
    }
  }

  // 2. 没有有效 token：按指纹匹配已有用户，不存在再新建
  const body = await request.json().catch(() => ({}))
  let fingerprint = body.fingerprint
  fingerprint = fingerprint?.trim() || null
  const clientIP = request.headers.get('cf-connecting-ip') || 'unknown_ip'
  const raw = `${clientIP}###${fingerprint}`
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(raw))
  const base64Hash = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const fingerId = base64Hash.slice(0, 22)
  if (fingerId) {
    const row = await DB.prepare(`SELECT id FROM users WHERE finger_id = ?`).bind(fingerId).first()
    if (row?.id) {
      return jsonResp({ code: 200, data: await generateToken(row.id) })
    }
  }

  // 3. 新建用户并返回新 token
  await DB.prepare(`INSERT INTO users (finger_id) VALUES (?)`).bind(fingerId).run()
  const row = await DB.prepare(`SELECT last_insert_rowid() AS id`).first()
  return jsonResp({ code: 200, data: await generateToken(row.id) })
}

/**
 * 添加 / 复用歌曲 POST /api/song/add
 * 以 source_song_id 去重；首次入库时回源音源接口补全封面、歌词、时长等元信息
 */
async function handleUpsertSong(request, env) {
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
/** 上报播放记录 POST /api/play/report，用于热度统计 */
async function handleReportPlay(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { id } = body
  const DB = env.DB
  await DB.prepare(
    `
    INSERT INTO play_records (user_id, song_id)
    VALUES (?, ?)
  `,
  )
    .bind(userId, id)
    .run()

  return jsonResp({ code: 200, msg: '请求成功' })
}

/** 热门推荐 GET /api/recommend/hot：日榜 + 周榜合并去重后返回 */
async function handleGetHotList(request, env) {
  const DB = env.DB

  const dayTopRes = await DB.prepare(
    `
    SELECT s.*, h.day_plays, h.week_plays
    FROM hot_song_stat h
    LEFT JOIN songs s ON s.id = h.song_id
    ORDER BY h.day_plays DESC
    LIMIT 20
  `,
  ).all()
  const weekTopRes = await DB.prepare(
    `
    SELECT s.*, h.day_plays, h.week_plays
    FROM hot_song_stat h
    LEFT JOIN songs s ON s.id = h.song_id
    ORDER BY h.week_plays DESC
    LIMIT 20
  `,
  ).all()

  // 日榜在前、周榜补位，按歌曲 id 去重
  const merged = new Map()
  for (const item of [...(dayTopRes.results || []), ...(weekTopRes.results || [])]) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item)
    }
  }
  const data = Array.from(merged.values()).map(item => mapSongRow(item))
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 最近播放列表 GET /api/playRecord/list：按 sort 倒序，只返回基础信息 */
async function handleGetRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      q.id AS queue_id,
      q.sort,
      s.*
    FROM user_play_record q
    LEFT JOIN songs s ON q.song_id = s.id
    WHERE q.user_id = ?
    ORDER BY q.sort DESC
  `,
  )
    .bind(userId)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/**
 * 加入最近播放 POST /api/playRecord/add
 * 超出上限时淘汰最早一条；同一首歌重复加入只刷新时间
 */
async function handleAddRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body

  // 参数校验
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB

  try {
    const stat = await DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS maxIdx FROM user_play_record WHERE user_id = ?`,
    )
      .bind(userId)
      .first()
    // 超限先淘汰最早一条，再写入
    await trimOldestIfFull(DB, 'user_play_record', userId, stat.total)
    await DB.prepare(
      `
      INSERT INTO user_play_record (user_id, song_id, sort)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, song_id)
      DO UPDATE SET create_time = CURRENT_TIMESTAMP
    `,
    )
      .bind(userId, songId, stat.maxIdx + 1)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '操作失败，请稍后重试' })
  }

  return jsonResp({ code: 200, msg: '添加成功' })
}

/** 从最近播放移除 POST /api/playRecord/remove */
async function handleRemoveRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB
  await DB.prepare(
    `
    DELETE FROM user_play_record
    WHERE user_id = ? AND song_id = ?
  `,
  )
    .bind(userId, songId)
    .run()
  return jsonResp({ code: 200, msg: '移除成功' })
}

/**
 * 把各上游搜索结果统一成前端 Song 结构
 * @returns {Array} 统一字段：id / source / title / singer / pic / album / lrc / url
 */
function normalizeSearchResults(source, data) {
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
    case 'qq':
      return Array.isArray(data)
        ? data.map(item => ({
            id: item.song_mid || '',
            source,
            title: item.song_title || '',
            singer: item.singer_name || '',
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
    default:
      return []
  }
}

/**
 * 多音源搜索 GET /api/music/search
 * 按 source 请求不同上游接口，并把结果统一成 Song 字段结构
 */
async function handleSearchMusic(request, _env) {
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
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    const data = await fetchRes.json().catch(() => {
      throw new Error('上游返回非标准JSON数据')
    })
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
async function handleSongStreamRedirect(request, _env) {
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
  try {
    const fetchRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(apiUrl).origin,
      },
    })
    data = await fetchRes.json().catch(() => null)
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
      case 'qq':
        finalUrl = data?.song_play_url
        break
      case 'mitu':
        finalUrl = data?.data?.url
        break
    }
  } catch (err) {
    return jsonResp({ code: 500, msg: `服务繁忙: ${err.message}` })
  }
  if (!finalUrl) {
    return jsonResp({ code: 404, msg: `资源不存在`, data })
  }
  return Response.redirect(finalUrl, 302)
}

/** 收藏列表 GET /api/favorite/list */
async function handleGetFavorites(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
      SELECT q.id queue_id, q.sort, s.*
      FROM user_favorite q
      LEFT JOIN songs s ON q.song_id = s.id
      WHERE q.user_id = ?
      ORDER BY q.sort DESC`,
  )
    .bind(userId)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, data })
}
/**
 * 收藏歌曲 POST /api/favorite/add
 * 超出上限时淘汰最早收藏；重复收藏走失败提示
 */
async function handleAddFavorite(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  // 参数校验
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB

  try {
    const stat = await DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS maxIdx FROM user_favorite WHERE user_id = ?`,
    )
      .bind(userId)
      .first()
    // 超限先淘汰最早收藏
    await trimOldestIfFull(DB, 'user_favorite', userId, stat.total)
    await DB.prepare(
      `
      INSERT INTO user_favorite (user_id, song_id, sort)
      VALUES (?, ?, ?)
    `,
    )
      .bind(userId, songId, stat.maxIdx + 1)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '已收藏该歌曲' })
  }
  return jsonResp({ code: 200, msg: `收藏成功` })
}
/** 取消收藏 POST /api/favorite/remove */
async function handleRemoveFavorite(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB
  await DB.prepare(
    `
    DELETE FROM user_favorite
    WHERE user_id = ? AND song_id = ?
  `,
  )
    .bind(userId, songId)
    .run()
  return jsonResp({ code: 200, msg: '取消收藏成功' })
}

/** 我的歌单 GET /api/playlist/owner：我创建的 + 我收藏的，带第一首封面与歌曲数 */
async function handleGetMyPlaylists(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      s.create_time as sub_create_time,
      CASE WHEN s.id IS NOT NULL THEN 0 ELSE 1 END AS owner,
      COALESCE(s.create_time, p.create_time) as sort_time,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count
    FROM user_playlist p
    LEFT JOIN user_playlist_sub s
      ON p.id = s.playlist_id AND s.user_id = ?
    WHERE p.user_id = ? OR s.user_id = ?
    ORDER BY sort_time DESC
  `,
  )
    .bind(userId, userId, userId)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '获取成功', data: results })
}

/** 创建歌单 POST /api/playlist/create */
async function handleCreatePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { name, desc } = await request.json()
  if (!name?.trim()) {
    return jsonResp({ code: 400, msg: '歌单名称不能为空' })
  }
  const DB = env.DB
  const res = await DB.prepare(`INSERT INTO user_playlist (user_id, name, desc) VALUES (?, ?, ?)`)
    .bind(userId, name.trim(), desc ?? null)
    .run()
  if (!res.success) {
    return jsonResp({ code: 500, msg: '创建失败' })
  }
  return jsonResp({ code: 200, msg: '创建成功', data: { id: res.meta.last_row_id } })
}
/** 收藏他人歌单 POST /api/subPlaylist/create，不能收藏自己创建的歌单 */
async function handleSubscribePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json()
  const { id } = body
  if (!id) return jsonResp({ code: 400, msg: '歌单id不能为空' })
  const DB = env.DB
  const row = await DB.prepare(`SELECT user_id FROM user_playlist WHERE id = ?`).bind(id).first()
  if (!row) {
    return jsonResp({ code: 404, msg: '歌单不存在' })
  }
  const ownerId = row.user_id
  if (ownerId === userId) {
    return jsonResp({ code: 400, msg: '不可收藏自己创建的歌单' })
  }
  try {
    await DB.prepare(`INSERT INTO user_playlist_sub (user_id, playlist_id) VALUES (?, ?)`)
      .bind(userId, id)
      .run()
    return jsonResp({ code: 200, msg: '收藏成功' })
  } catch {
    return jsonResp({ code: 400, msg: '该歌单已收藏' })
  }
}
/** 歌单详情 GET /api/playlist/detail?id=xx：歌曲列表 + 收藏状态 */
async function handleGetPlaylistDetail(request, env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim() || ''
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT ps.id as rel_id, ps.song_id, ps.sort,
    s.*
    FROM playlist_song ps
    LEFT JOIN songs s ON ps.song_id = s.id
    WHERE ps.playlist_id = ?
    ORDER BY ps.sort
  `,
  )
    .bind(id)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, msg: '获取成功', data })
}
/** 歌单添加歌曲 POST /api/playlist/add-song：新歌追加到末尾 */
async function handleAddPlaylistSong(request, env) {
  const { playlistId, id } = await request.json()
  if (!playlistId || !id) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const maxRow = await DB.prepare(
    `
    SELECT MAX(sort) as maxSort FROM playlist_song WHERE playlist_id = ?
  `,
  )
    .bind(playlistId)
    .first()
  const nextSort = (maxRow?.maxSort ?? -1) + 1
  try {
    await DB.prepare(
      `
      INSERT INTO playlist_song (playlist_id, song_id, sort) VALUES (?, ?, ?)
    `,
    )
      .bind(playlistId, id, nextSort)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '添加失败' })
  }
  return jsonResp({ code: 200, msg: '添加成功' })
}

/** 歌单歌曲排序 POST /api/playlist/sort-song：按数组顺序批量更新 sort */
async function handleSortPlaylistSongs(request, env) {
  const { playlistId, list } = await request.json()
  if (!playlistId || !Array.isArray(list)) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const stmt = DB.prepare(`UPDATE playlist_song SET sort = ? WHERE id = ? AND playlist_id = ?`)
  const batch = list.map((item, index) => stmt.bind(index + 1, item.id, playlistId))
  await DB.batch(batch)
  return jsonResp({ code: 200, msg: '排序已更新' })
}

/** 歌单移除歌曲 POST /api/playlist/remove-song */
async function handleRemovePlaylistSong(request, env) {
  const { playlistId, id } = await request.json()
  if (!playlistId || !id) return jsonResp({ code: 500, msg: '参数不全' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM playlist_song WHERE song_id=? AND playlist_id=?`)
    .bind(id, playlistId)
    .run()

  return jsonResp({ code: 200, msg: '已移除' })
}

/** 删除我创建的歌单 POST /api/playlist/delete */
async function handleDeletePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM user_playlist WHERE id=? AND user_id=?`).bind(id, userId).run()
  return jsonResp({ code: 200, msg: '歌单已删除' })
}
/** 取消收藏歌单 POST /api/subPlaylist/delete */
async function handleUnsubscribePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM user_playlist_sub WHERE id=? AND user_id=?`).bind(id, userId).run()
  return jsonResp({ code: 200, msg: '歌单已删除' })
}

/** 发现歌单 GET /api/playlist/discover：按订阅人数倒序，最多返回 MAX_PLAYLIST_COUNT 条 */
async function handleGetDiscoverPlaylists(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      COALESCE(sub.subscribe_count, 0) + 1 AS subscribe_count,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END AS owner,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    ORDER BY subscribe_count DESC, p.create_time DESC
    LIMIT ?
  `,
  )
    .bind(userId, MAX_PLAYLIST_COUNT)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '获取发现歌单列表成功', data: results })
}

/** 歌曲详情 GET /api/song/detail?id=xx：返回统一 Song 字段 + 收藏状态 */
async function handleGetSongDetail(request, env) {
  const userId = getRequestUserId(request)
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

/** 主题色结果缓存（Workers isolate 级别，避免重复下载解码封面） */
const themeColorCache = new Map()
const FALLBACK_PALETTE = ['#7a3b3b', '#3b5a7a', '#4c3b7a', '#7a6a3b', '#3b7a5a', '#7a3b6a']

/**
 * 通过歌曲 id 查封面主题色
 * GET /api/song/theme-color?id=xxx
 * 返回 { id, pic, color, rgb, fallback }
 */
async function handleGetSongThemeColor(request, env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) return jsonResp({ code: 400, msg: 'id不能为空' })

  if (themeColorCache.has(id)) {
    return jsonResp({ code: 200, msg: '请求成功', data: themeColorCache.get(id) })
  }

  const row = await env.DB.prepare('SELECT id, cover_url FROM songs WHERE id = ?').bind(id).first()
  if (!row) return jsonResp({ code: 404, msg: '歌曲不存在' })

  const pic = row.cover_url || ''
  let color = ''
  let fallback = false
  try {
    color = await extractThemeColor(pic)
  } catch (e) {
    console.warn('[theme-color] 取色失败', id, e.message)
    color = FALLBACK_PALETTE[hashSeed(pic || String(id)) % FALLBACK_PALETTE.length]
    fallback = true
  }

  const data = { id: row.id, pic, color, rgb: hexToRgb(color), fallback }
  // 失败结果不缓存，下次重试；成功结果按 isolate 缓存
  if (!fallback) {
    if (themeColorCache.size > 500) themeColorCache.clear()
    themeColorCache.set(id, data)
  }
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 取封面平均色：直接下载原图，在 Worker 内解码（JPEG / PNG），不依赖任何外部服务 */
async function extractThemeColor(picUrl) {
  if (!picUrl) throw new Error('缺少封面地址')
  let source = picUrl
  if (source.startsWith('//')) source = `https:${source}`
  source = source.replace(/^http:\/\//, 'https://')

  const res = await fetch(source, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AinMusicWorker/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`封面请求失败 ${res.status}`)

  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    const [r, g, b] = decodeJpegAverageColor(bytes)
    return rgbToHex(r, g, b)
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const [r, g, b] = await decodePngAverageColor(buffer)
    return rgbToHex(r, g, b)
  }
  throw new Error('不支持的图片格式')
}

/**
 * 解码 PNG 并返回平均 RGB
 * 仅支持 8 位色深、非隔行；覆盖 RGB/RGBA/灰度/灰度+Alpha/调色板
 */
async function decodePngAverageColor(buffer) {
  const bytes = new Uint8Array(buffer)
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  if (!isPng) throw new Error('不是 PNG 数据')

  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  let palette = null
  const idatChunks = []

  while (pos + 8 <= bytes.length) {
    const length = readUint32(bytes, pos)
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    const start = pos + 8
    if (type === 'IHDR') {
      width = readUint32(bytes, start)
      height = readUint32(bytes, start + 4)
      bitDepth = bytes[start + 8]
      colorType = bytes[start + 9]
      if (bytes[start + 12] !== 0) throw new Error('不支持隔行 PNG')
    } else if (type === 'PLTE') {
      palette = bytes.slice(start, start + length)
    } else if (type === 'IDAT') {
      idatChunks.push(bytes.slice(start, start + length))
    } else if (type === 'IEND') {
      break
    }
    pos = start + length + 4
  }

  if (!width || !height) throw new Error('PNG 尺寸无效')
  if (bitDepth !== 8) throw new Error(`不支持 ${bitDepth} 位色深`)

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`)

  const total = idatChunks.reduce((n, c) => n + c.length, 0)
  const compressed = new Uint8Array(total)
  let offset = 0
  for (const chunk of idatChunks) {
    compressed.set(chunk, offset)
    offset += chunk.length
  }
  const raw = await inflateZlib(compressed)

  const stride = width * channels
  const pixels = new Uint8Array(height * stride)
  let src = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]
    const rowStart = y * stride
    const prevStart = (y - 1) * stride
    for (let x = 0; x < stride; x++) {
      const value = raw[src++]
      const a = x >= channels ? pixels[rowStart + x - channels] : 0
      const b = y > 0 ? pixels[prevStart + x] : 0
      const c = x >= channels && y > 0 ? pixels[prevStart + x - channels] : 0
      let out = value
      if (filter === 1) {
        out = value + a
      } else if (filter === 2) {
        out = value + b
      } else if (filter === 3) {
        out = value + ((a + b) >> 1)
      } else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      pixels[rowStart + x] = out & 0xFF
    }
  }

  let r = 0
  let g = 0
  let b = 0
  const count = width * height
  for (let i = 0; i < count; i++) {
    const o = i * channels
    if (colorType === 3) {
      const idx = pixels[o] * 3
      r += palette[idx] || 0
      g += palette[idx + 1] || 0
      b += palette[idx + 2] || 0
    } else if (colorType === 0 || colorType === 4) {
      const v = pixels[o]
      r += v
      g += v
      b += v
    } else {
      r += pixels[o]
      g += pixels[o + 1]
      b += pixels[o + 2]
    }
  }
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

/** 解压 zlib 流（PNG IDAT 为 zlib 格式） */
async function inflateZlib(data) {
  const stream = new Response(data).body.pipeThrough(new DecompressionStream('deflate'))
  const out = await new Response(stream).arrayBuffer()
  return new Uint8Array(out)
}

/** 读取大端 32 位无符号整数（PNG 块长度 / 宽高等） */
function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

/** 字符串哈希：把封面地址稳定映射到兜底调色板下标 */
function hashSeed(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash
}

/** RGB 转 #rrggbb（分量自动夹到 0-255） */
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

/** #rrggbb 转 [r, g, b]；非法输入返回黑色 */
function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return match ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)] : [0, 0, 0]
}

/** 四舍五入并夹到 0-255 的整数 */
function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

// ===================== JPEG 平均色 =====================

/**
 * 完全自研的 JPEG 平均色提取：
 * DCT 的 DC 系数就是 8×8 块的均值，因此不需要反量化 + IDCT 逐像素渲染，
 * 只要按 Huffman 表把每个块的 DC 解出来加权平均，即可得到整图平均色。
 * 支持基线（SOF0/SOF1）与渐进式（SOF2）；渐进式只解 DC 首扫，其余扫描按字节跳过。
 */
function decodeJpegAverageColor(data) {
  if (data[0] !== 0xFF || data[1] !== 0xD8) throw new Error('不是 JPEG 数据')

  const quant = []
  const huffDC = []
  const huffAC = []
  let frame = null
  let restartInterval = 0
  let adobeTransform = -1
  let sums = []
  let counts = []

  let pos = 2
  while (pos < data.length) {
    if (data[pos] !== 0xFF) {
      pos++
      continue
    }
    let marker = data[pos + 1]
    while (marker === 0xFF) {
      pos++
      marker = data[pos + 1]
    }
    pos += 2

    if (marker === 0xD9) break
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue

    if (marker === 0xDA) {
      if (!frame) throw new Error('JPEG 缺少 SOF')
      const scan = parseScanHeader(data, pos)
      const isDCFirst = scan.ss === 0 && scan.se === 0 && scan.ah === 0
      pos = frame.progressive && !isDCFirst
        ? skipEntropy(data, scan.dataStart)
        : decodeScan(data, scan, frame, quant, huffDC, huffAC, restartInterval, sums, counts)
      continue
    }

    if (pos + 2 > data.length) break
    const len = readU16(data, pos)
    const start = pos + 2
    const end = Math.min(pos + len, data.length)

    if (marker === 0xDB) {
      parseDqt(data, start, end, quant)
    } else if (marker === 0xC4) {
      parseDht(data, start, end, huffDC, huffAC)
    } else if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      frame = parseSof(data, start, end, marker === 0xC2)
      sums = frame.components.map(() => 0)
      counts = frame.components.map(() => 0)
    } else if (marker === 0xDD) {
      restartInterval = readU16(data, start)
    } else if (marker === 0xEE) {
      adobeTransform = parseAdobeTransform(data, start, end)
    }
    pos = end
  }

  if (!frame) throw new Error('JPEG 缺少 SOF')
  const means = frame.components.map((_, i) => {
    if (!counts[i]) throw new Error('JPEG 未解析到有效数据')
    return 128 + sums[i] / (8 * counts[i])
  })

  if (means.length === 1) return [clamp255(means[0]), clamp255(means[0]), clamp255(means[0])]
  if (means.length < 3) throw new Error('不支持的 JPEG 分量数')

  if (adobeTransform === 0)
    return [clamp255(means[0]), clamp255(means[1]), clamp255(means[2])]

  const y = means[0]
  const cb = means[1] - 128
  const cr = means[2] - 128
  return [
    clamp255(y + 1.402 * cr),
    clamp255(y - 0.344 * cb - 0.714 * cr),
    clamp255(y + 1.772 * cb),
  ]
}

/** 解码一个扫描段（基线全系数 / 渐进式 DC 首扫） */
function decodeScan(data, scan, frame, quant, huffDC, huffAC, restartInterval, sums, counts) {
  const entries = scan.components.map((sc) => {
    const index = frame.components.findIndex(c => c.id === sc.id)
    if (index < 0) throw new Error('扫描分量不存在')
    return { index, comp: frame.components[index], dc: sc.dc, ac: sc.ac }
  })

  const reader = createBitReader(data, scan.dataStart)
  const predictors = frame.components.map(() => 0)
  const useAC = !frame.progressive

  let units = 0
  if (entries.length > 1) {
    units = Math.ceil(frame.width / (8 * frame.maxH)) * Math.ceil(frame.height / (8 * frame.maxV))
  } else {
    const comp = entries[0].comp
    const blockCols = Math.ceil(Math.ceil((frame.width * comp.h) / frame.maxH) / 8)
    const blockRows = Math.ceil(Math.ceil((frame.height * comp.v) / frame.maxV) / 8)
    units = blockCols * blockRows
  }

  for (let u = 0; u < units; u++) {
    if (restartInterval > 0 && u > 0 && u % restartInterval === 0) {
      reader.consumeRestart()
      predictors.fill(0)
    }
    if (entries.length > 1) {
      for (const entry of entries) {
        const blocks = entry.comp.h * entry.comp.v
        for (let b = 0; b < blocks; b++)
          decodeBlock(reader, entry, useAC, scan.al, quant, huffDC, huffAC, predictors, sums, counts)
      }
    } else {
      decodeBlock(reader, entries[0], useAC, scan.al, quant, huffDC, huffAC, predictors, sums, counts)
    }
  }

  return reader.getPosition()
}

/**
 * 解一个 8×8 块：解 DC 差分并把「块均值」累加到 sums
 * 基线模式下还要继续解 AC 系数，只为推进码流（不参与取色）
 */
function decodeBlock(reader, entry, useAC, al, quant, huffDC, huffAC, predictors, sums, counts) {
  const dcTable = huffDC[entry.dc]
  if (!dcTable) throw new Error('缺少 DC Huffman 表')

  const size = decodeHuffman(reader, dcTable)
  const diff = size === 0 ? 0 : extendValue(reader.readBits(size), size)

  const ci = entry.index
  predictors[ci] += diff

  const q00 = (quant[entry.comp.tq] && quant[entry.comp.tq][0]) || 1
  sums[ci] += (predictors[ci] << al) * q00
  counts[ci] += 1

  if (!useAC)
    return

  const acTable = huffAC[entry.ac]
  if (!acTable) throw new Error('缺少 AC Huffman 表')

  let k = 1
  while (k < 64) {
    const rs = decodeHuffman(reader, acTable)
    const s = rs & 15
    const r = rs >> 4
    if (s === 0) {
      if (r === 15) {
        k += 16
        continue
      }
      break
    }
    k += r
    reader.readBits(s)
    k++
  }
}

/** 熵编码字节流读取器：处理 0xFF00 填充与 RST 重启标记 */
function createBitReader(data, start) {
  let pos = start
  let current = 0
  let bitsLeft = 0

  /** 读下一个熵编码字节：0xFF00 填充按 0xFF 处理，遇到真实 marker 返回 0 */
  function nextByte() {
    if (pos >= data.length) return 0
    const byte = data[pos]
    if (byte === 0xFF) {
      let p = pos + 1
      while (p < data.length && data[p] === 0xFF) p++
      if (p < data.length && data[p] === 0x00) {
        pos = p + 1
        return 0xFF
      }
      return 0
    }
    pos++
    return byte
  }

  return {
    readBit() {
      if (bitsLeft === 0) {
        current = nextByte()
        bitsLeft = 8
      }
      bitsLeft--
      return (current >> bitsLeft) & 1
    },
    readBits(n) {
      let value = 0
      for (let i = 0; i < n; i++) value = (value << 1) | this.readBit()
      return value
    },
    consumeRestart() {
      bitsLeft = 0
      let p = pos
      while (p < data.length && data[p] !== 0xFF) p++
      while (p < data.length && data[p] === 0xFF) p++
      if (p < data.length && data[p] >= 0xD0 && data[p] <= 0xD7) p++
      pos = p
    },
    getPosition() {
      return pos
    },
  }
}

/** 解析 SOS 扫描头：分量与 Huffman 表选择、Ss/Se/Ah/Al、熵数据起始位置 */
function parseScanHeader(data, pos) {
  const len = readU16(data, pos)
  const start = pos + 2
  const n = data[start]
  const components = []
  let p = start + 1
  for (let i = 0; i < n; i++) {
    components.push({ id: data[p], dc: data[p + 1] >> 4, ac: data[p + 1] & 15 })
    p += 2
  }
  return {
    components,
    ss: data[p],
    se: data[p + 1],
    ah: data[p + 2] >> 4,
    al: data[p + 2] & 15,
    dataStart: p + 3,
    end: pos + len,
  }
}

/** 解析 DQT 量化表（zigzag 顺序存放，下标 0 即 DC 系数） */
function parseDqt(data, start, end, quant) {
  let p = start
  while (p < end) {
    const pqTq = data[p++]
    const precision = pqTq >> 4
    const id = pqTq & 15
    const table = new Uint16Array(64)
    for (let i = 0; i < 64; i++) {
      if (precision === 0) {
        table[i] = data[p++]
      } else {
        table[i] = readU16(data, p)
        p += 2
      }
    }
    quant[id] = table
  }
}

/** 解析 DHT Huffman 表：按类别（0=DC / 1=AC）与表 id 存入数组 */
function parseDht(data, start, end, huffDC, huffAC) {
  let p = start
  while (p < end) {
    const tcTh = data[p++]
    const cls = tcTh >> 4
    const id = tcTh & 15
    const counts = new Uint8Array(17)
    let total = 0
    for (let i = 1; i <= 16; i++) {
      counts[i] = data[p++]
      total += counts[i]
    }
    const symbols = new Uint8Array(total)
    for (let i = 0; i < total; i++) symbols[i] = data[p++]

    const table = buildHuffmanTable(counts, symbols)
    if (cls === 0) huffDC[id] = table
    else huffAC[id] = table
  }
}

/** 解析 SOF 帧头：图像尺寸、是否渐进式、各分量采样因子与量化表 id */
function parseSof(data, start, end, progressive) {
  const height = readU16(data, start + 1)
  const width = readU16(data, start + 3)
  const n = data[start + 5]
  if (!width || !height) throw new Error('JPEG 尺寸无效')
  if (end - start < 6 + n * 3) throw new Error('JPEG SOF 数据不完整')

  const components = []
  let maxH = 1
  let maxV = 1
  let p = start + 6
  for (let i = 0; i < n; i++) {
    const h = data[p + 1] >> 4 || 1
    const v = data[p + 1] & 15 || 1
    components.push({ id: data[p], h, v, tq: data[p + 2] })
    if (h > maxH) maxH = h
    if (v > maxV) maxV = v
    p += 3
  }
  return { width, height, progressive, components, maxH, maxV }
}

/** 解析 APP14(Adobe) 段：transform 为 0 表示分量是 RGB 而不是 YCbCr */
function parseAdobeTransform(data, start, end) {
  if (end - start < 12) return -1
  const tag = String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4])
  return tag === 'Adobe' ? data[start + 11] : -1
}

/** 按码长分布构建规范 Huffman 表：数组下标为码长，内部 Map 为 code → symbol */
function buildHuffmanTable(counts, symbols) {
  const tables = Array.from({ length: 17 })
  let code = 0
  let k = 0
  for (let len = 1; len <= 16; len++) {
    const map = new Map()
    for (let i = 0; i < counts[len]; i++) map.set(code++, symbols[k++])
    tables[len] = map
    code <<= 1
  }
  return tables
}

/** 逐位读取并查 Huffman 表，返回解出的符号 */
function decodeHuffman(reader, table) {
  let code = 0
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.readBit()
    const symbol = table[len].get(code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('Huffman 解码失败')
}

/** JPEG 幅值扩展：把 size 位无符号值还原成有符号差分 */
function extendValue(value, size) {
  return value < 1 << (size - 1) ? value - (1 << size) + 1 : value
}

/** 字节级跳过熵编码段，直到下一个真实 marker（跳过 0xFF00 与 RSTn） */
function skipEntropy(data, start) {
  let pos = start
  while (pos < data.length) {
    if (data[pos] === 0xFF) {
      let p = pos + 1
      while (p < data.length && data[p] === 0xFF) p++
      if (p >= data.length) return p
      const marker = data[p]
      if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
        pos = p + 1
        continue
      }
      return pos
    }
    pos++
  }
  return pos
}

/** 读取大端 16 位整数（JPEG 段长度等） */
function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}
