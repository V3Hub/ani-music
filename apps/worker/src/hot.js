import { requireActiveUser } from './auth.js'
import { getHotCacheTtl } from './config.js'
import { mapSongRow, trimOldestIfFull } from './db.js'
import { jsonResp } from './http.js'

export const HOT_MODE_PROFILES = {
  default: { playedPenalty: 10, playedBonus: 0, affinityWeight: 2, freshWeight: 1, genres: [] },
  familiar: { playedPenalty: 0, playedBonus: 8, affinityWeight: 3, freshWeight: 0.6, genres: [] },
  fresh: { playedPenalty: 22, playedBonus: 0, affinityWeight: 1, freshWeight: 2.4, genres: [] },
  library: { playedPenalty: 10, playedBonus: 0, affinityWeight: 2, freshWeight: 1, genres: ['acoustic', 'folk', 'piano', 'lofi', 'light', 'instrumental', 'jazz'] },
  emo: { playedPenalty: 6, playedBonus: 2, affinityWeight: 2, freshWeight: 0.8, genres: ['ballad', 'sad', 'emo', 'r&b', 'rnb', 'love', 'soul'] },
  dj: { playedPenalty: 8, playedBonus: 3, affinityWeight: 1.5, freshWeight: 0.8, genres: ['dance', 'electronic', 'edm', 'remix', 'house', 'dj', 'rap', 'hip-hop', 'hiphop'] },
  sleep: { playedPenalty: 12, playedBonus: 0, affinityWeight: 1.5, freshWeight: 1.2, genres: ['ambient', 'sleep', 'piano', 'lofi', 'instrumental', 'light', 'acoustic'] },
}

/**
 * 热门推荐 GET /api/recommend/hot?mode=xxx&exclude=1,2,3
 * 综合热度、偏好与新鲜度打分：
 *  - 热度：日榜权重高于周榜，避免旧热歌长期占位
 *  - 偏好：收藏过的歌手 > 常听歌手，收藏过的歌曲小幅加权
 *  - 去重：听过的歌降权，同一歌手最多两首
 *  - 兜底：热度为 0 的新歌按 id 新鲜度加分，保证冷启动也有内容
 *  - 模式：mode 决定降权 / 曲风偏好策略，切换模式即刷新为对应榜单
 *  - 换批：exclude 传入已播放的歌曲 id，30 首放完后取下一批不重复的歌
 */
export async function handleGetHotList(request, env) {
  const DB = env.DB
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const url = new URL(request.url)
  const rawMode = String(url.searchParams.get('mode') || 'default')
  // 标签模式：mode=tag:标签名，大小写敏感，不能整体转小写
  const tagFilter = rawMode.startsWith('tag:') ? rawMode.slice(4).trim() : ''
  const mode = tagFilter ? 'default' : rawMode.toLowerCase()
  const profile = HOT_MODE_PROFILES[mode] || HOT_MODE_PROFILES.default
  // 稳定模式扰动种子：保证同一批热歌在不同模式下排序有差异，且结果可复现
  const seedText = tagFilter || mode
  const modeSeed = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const excludeIds = new Set(
    String(url.searchParams.get('exclude') || '')
      .split(',')
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0),
  )

  // 候选池：全部歌曲带上近 7 天实时热度，最多取 300 首参与排序
  // KV 缓存 5 分钟：热度是全局数据，与用户无关，缓存可大幅减少 user_play_record 的 GROUP BY 扫描
  const cacheKey = `hot:candidates:${tagFilter || 'all'}`
  let results = null
  if (env.HOT_KV) {
    const cached = await env.HOT_KV.get(cacheKey, { type: 'json' })
    if (cached) results = cached
  }
  if (!results) {
    const query = await DB.prepare(
      `
      SELECT s.*,
             COALESCE(h.day_plays, 0) AS day_plays,
             COALESCE(h.week_plays, 0) AS week_plays
      FROM songs s
      LEFT JOIN (
        SELECT song_id,
               COUNT(*) AS week_plays,
               SUM(CASE
                 WHEN create_time >= DATETIME(DATE('now', '-1 day'))
                  AND create_time < DATETIME('now') THEN 1 ELSE 0
               END) AS day_plays
        FROM user_play_record
        WHERE create_time >= DATETIME(DATE('now', '-6 day'))
        GROUP BY song_id
      ) h ON h.song_id = s.id
      WHERE (? = '' OR EXISTS (
        SELECT 1 FROM song_tag t WHERE t.song_id = s.id AND t.tag = ?
      ))
      ORDER BY (COALESCE(h.day_plays, 0) * 3 + COALESCE(h.week_plays, 0)) DESC,
               s.id DESC
      LIMIT 300
    `,
    ).bind(tagFilter, tagFilter).all()
    results = query.results || []
    if (env.HOT_KV) {
      // 异步写入缓存，不阻塞响应
      env.HOT_KV.put(cacheKey, JSON.stringify(results), { expirationTtl: getHotCacheTtl(env) }).catch(() => {})
    }
  }
  // 换批次：排除已播放过的歌曲，保证下一批不重复
  const rows = (results || []).filter(row => !excludeIds.has(Number(row.id)))
  if (!rows.length)
    return jsonResp({ code: 200, msg: '请求成功', data: [] })

  const maxIdRow = await DB.prepare('SELECT COALESCE(MAX(id), 1) AS maxId FROM songs').first()
  const maxId = Number(maxIdRow?.maxId) || 1

  // 用户偏好信号：收藏歌曲、历史播放、歌手权重
  const favoriteIds = new Set()
  const playedIds = new Set()
  const artistWeight = new Map()
  if (userId) {
    const [favSongs, historySongs] = await Promise.all([
      DB.prepare(
        `
        SELECT s.id, s.artist
        FROM user_favorite f
        JOIN songs s ON s.id = f.song_id
        WHERE f.user_id = ?
      `,
      ).bind(userId).all(),
      DB.prepare(
        `
        SELECT s.id, s.artist
        FROM user_play_record p
        JOIN songs s ON s.id = p.song_id
        WHERE p.user_id = ?
      `,
      ).bind(userId).all(),
    ])
    for (const row of favSongs.results || []) {
      favoriteIds.add(row.id)
      if (row.artist)
        artistWeight.set(row.artist, (artistWeight.get(row.artist) || 0) + 3)
    }
    for (const row of historySongs.results || []) {
      playedIds.add(row.id)
      if (row.artist)
        artistWeight.set(row.artist, (artistWeight.get(row.artist) || 0) + 1)
    }
  }

  const scored = rows.map((row) => {
    const day = Number(row.day_plays) || 0
    const week = Number(row.week_plays) || 0
    // 新鲜度：越新加分越高，最多 12 分，帮助零播放的新歌进入榜单
    const freshness = (Number(row.id) / maxId) * 12
    const affinity = row.artist ? (artistWeight.get(row.artist) || 0) * profile.affinityWeight : 0
    const favoriteBonus = favoriteIds.has(row.id) ? 6 : 0
    // 已经听过的歌按模式降权 / 加权：熟悉模式反而不降权，新鲜模式重罚
    const played = playedIds.has(row.id)
    const playedPenalty = played ? profile.playedPenalty : 0
    const playedBonus = played ? profile.playedBonus : 0
    // 场景模式偏好对应曲风：命中标签的歌曲额外加权
    const genreText = String(row.genre || '').toLowerCase()
    const genreBoost = profile.genres.some(genre => genreText.includes(genre)) ? 15 : 0
    // 模式扰动：同一批热歌在不同模式下顺序不同，切换模式后榜单不会完全一样
    const jitter = ((Number(row.id) * 31 + modeSeed * 17) % 23) / 23 * 3
    const score = day * 3 + week + freshness * profile.freshWeight + affinity + favoriteBonus - playedPenalty + playedBonus + genreBoost + jitter
    return { row, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // 同一歌手最多两首，避免整页都是同一个人的歌
  const artistCount = new Map()
  const data = []
  for (const { row } of scored) {
    const artist = row.artist || ''
    if (artist) {
      const used = artistCount.get(artist) || 0
      if (used >= 2) continue
      artistCount.set(artist, used + 1)
    }
    data.push(mapSongRow(row))
    if (data.length >= 30) break
  }

  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 最近播放列表 GET /api/playRecord/list：按 sort 倒序，只返回基础信息 */
export async function handleGetRecentPlay(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleAddRecentPlay(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleRemoveRecentPlay(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
