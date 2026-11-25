import { requireActiveUser, requireAdmin } from './auth.js'
import { MAX_PLAYLIST_COUNT } from './config.js'
import { mapSongRow, trimOldestIfFull } from './db.js'
import { jsonResp } from './http.js'

export async function handleGetFavorites(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleAddFavorite(request, env) {
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
export async function handleRemoveFavorite(request, env) {
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
    DELETE FROM user_favorite
    WHERE user_id = ? AND song_id = ?
  `,
  )
    .bind(userId, songId)
    .run()
  return jsonResp({ code: 200, msg: '取消收藏成功' })
}

/** 我的歌单 GET /api/playlist/owner：我创建的 + 我收藏的，带第一首封面与歌曲数 */
export async function handleGetMyPlaylists(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN user_playlist_sub s
      ON p.id = s.playlist_id AND s.user_id = ?
    LEFT JOIN users u ON u.id = p.user_id
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
export async function handleCreatePlaylist(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleSubscribePlaylist(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleGetPlaylistDetail(request, env) {
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
export async function handleAddPlaylistSong(request, env) {
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

/** 歌单歌曲排序 POST /api/playlist/sort-song：仅歌单拥有者可用，按数组顺序批量更新 sort */
export async function handleSortPlaylistSongs(request, env) {
  const { playlistId, list } = await request.json()
  if (!playlistId || !Array.isArray(list)) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const owner = await DB.prepare('SELECT user_id FROM user_playlist WHERE id = ?').bind(playlistId).first()
  if (!owner) return jsonResp({ code: 404, msg: '歌单不存在' })
  if (String(owner.user_id) !== String(userId))
    return jsonResp({ code: 403, msg: '仅歌单拥有者可调整顺序' })
  const stmt = DB.prepare(`UPDATE playlist_song SET sort = ? WHERE song_id = ? AND playlist_id = ?`)
  const batch = list.map((item, index) => stmt.bind(index + 1, item.id, playlistId))
  // 拥有者手动整理顺序后，之前的播放失败降序标记全部作废，避免残留 original_sort 干扰后续降序/恢复
  batch.push(DB.prepare('UPDATE playlist_song SET original_sort = NULL WHERE playlist_id = ?').bind(playlistId))
  await DB.batch(batch)
  return jsonResp({ code: 200, msg: '排序已更新' })
}

/** 歌单歌曲降序 POST /api/playlist/demote-song：播放失败的歌曲移到歌单末尾，返回新 sort 值供恢复时校验 */
export async function handleDemotePlaylistSong(request, env) {
  const { playlistId, id } = await request.json().catch(() => ({}))
  if (!playlistId || !id) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const row = await DB.prepare(
    'SELECT sort FROM playlist_song WHERE playlist_id = ? AND song_id = ?',
  ).bind(playlistId, id).first()
  if (!row) return jsonResp({ code: 404, msg: '歌曲不在该歌单中' })
  // 已经被降序过就不重复处理
  if (row.original_sort != null) return jsonResp({ code: 200, msg: '已在末尾', data: { demotedSort: row.sort } })
  const maxRow = await DB.prepare(
    'SELECT MAX(sort) AS maxSort FROM playlist_song WHERE playlist_id = ?',
  ).bind(playlistId).first()
  const nextSort = (Number(maxRow?.maxSort) || 0) + 1
  await DB.prepare(
    'UPDATE playlist_song SET sort = ?, original_sort = ? WHERE playlist_id = ? AND song_id = ?',
  ).bind(nextSort, row.sort, playlistId, id).run()
  return jsonResp({ code: 200, msg: '已降到末尾', data: { demotedSort: nextSort } })
}

/**
 * 歌单歌曲恢复排序 POST /api/playlist/promote-song：播放成功后恢复原始排序位置
 * 可选传入 expectedSort（乐观锁），只有当前 sort 仍等于 expectedSort 才恢复，避免覆盖他人编辑
 */
export async function handlePromotePlaylistSong(request, env) {
  const { playlistId, id, expectedSort } = await request.json().catch(() => ({}))
  if (!playlistId || !id) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  // 带 expectedSort 时用它做条件更新：没人动过这首歌才恢复
  if (expectedSort != null) {
    const info = await DB.prepare(
      `UPDATE playlist_song SET sort = original_sort, original_sort = NULL
       WHERE playlist_id = ? AND song_id = ? AND original_sort IS NOT NULL AND sort = ?`,
    ).bind(playlistId, id, expectedSort).run()
    if (info.changes === 0)
      return jsonResp({ code: 200, msg: '歌曲已被他人修改，跳过恢复' })
    return jsonResp({ code: 200, msg: '已恢复排序' })
  }
  // 兼容旧客户端：不传 expectedSort 时仍允许恢复（退化逻辑）
  const row = await DB.prepare(
    'SELECT original_sort FROM playlist_song WHERE playlist_id = ? AND song_id = ?',
  ).bind(playlistId, id).first()
  if (!row || row.original_sort == null)
    return jsonResp({ code: 200, msg: '无需恢复' })
  await DB.prepare(
    'UPDATE playlist_song SET sort = original_sort, original_sort = NULL WHERE playlist_id = ? AND song_id = ?',
  ).bind(playlistId, id).run()
  return jsonResp({ code: 200, msg: '已恢复排序' })
}

/** 歌单移除歌曲 POST /api/playlist/remove-song */
export async function handleRemovePlaylistSong(request, env) {
  const { playlistId, id } = await request.json()
  if (!playlistId || !id) return jsonResp({ code: 500, msg: '参数不全' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM playlist_song WHERE song_id=? AND playlist_id=?`)
    .bind(id, playlistId)
    .run()

  return jsonResp({ code: 200, msg: '已移除' })
}

/** 删除歌单 POST /api/playlist/delete：作者本人或管理员 */
export async function handleDeletePlaylist(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  const adminId = await requireAdmin(request, env)
  if (adminId) {
    await DB.prepare(`DELETE FROM user_playlist WHERE id=?`).bind(id).run()
  } else {
    await DB.prepare(`DELETE FROM user_playlist WHERE id=? AND user_id=?`).bind(id, userId).run()
  }
  return jsonResp({ code: 200, msg: '歌单已删除' })
}
/** 取消收藏歌单 POST /api/subPlaylist/delete */
export async function handleUnsubscribePlaylist(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM user_playlist_sub WHERE id=? AND user_id=?`).bind(id, userId).run()
  return jsonResp({ code: 200, msg: '歌单已删除' })
}

/** 发现歌单 GET /api/playlist/discover：按订阅人数倒序，最多返回 MAX_PLAYLIST_COUNT 条 */
export async function handleGetDiscoverPlaylists(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY subscribe_count DESC, p.create_time DESC
    LIMIT ?
  `,
  )
    .bind(userId, MAX_PLAYLIST_COUNT)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '获取发现歌单列表成功', data: results })
}

/** 搜索歌单 GET /api/playlist/search?keyword=xx：仅按歌单名称模糊匹配，最多返回 30 条 */
export async function handleSearchPlaylists(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const keyword = (new URL(request.url).searchParams.get('keyword') || '').trim()
  if (!keyword) {
    return jsonResp({ code: 200, msg: '搜索歌单成功', data: [] })
  }
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
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.name LIKE ?
    ORDER BY subscribe_count DESC, p.create_time DESC
    LIMIT 30
  `,
  )
    .bind(userId, `%${keyword}%`)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '搜索歌单成功', data: results })
}

/** 歌单信息 GET /api/playlist/info?id=xx：分享链接打开时使用，返回单条歌单信息 */
export async function handleGetPlaylistInfo(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '歌单不存在' })
  }
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
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `,
  )
    .bind(userId, id)
    .all()
  const item = results[0]
  if (!item) {
    return jsonResp({ code: 404, msg: '歌单不存在' })
  }
  item.owner = Boolean(item.owner)
  return jsonResp({ code: 200, msg: '获取歌单信息成功', data: item })
}

/**
 * 分享 token：6 位 base62 短码
 * 前 4 位承载「id * 2 + 类型」，后 2 位是 HMAC 校验位
 * 校验位由 SECRET_KEY 派生，保证链接无法被随意枚举，同时长度保持简短
 */
