import { requireActiveUser, requireAdmin } from './auth.js'
import { jsonResp } from './http.js'

export function normalizeTag(raw) {
  const tag = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!tag || tag.length > 12) return ''
  return tag
}

/** 热门标签 GET /api/song/tags?limit=12 —— 听歌模式据此生成标签模式 */
export async function handleGetHotSongTags(request, env) {
  const url = new URL(request.url)
  const limit = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '12', 10) || 12))
  const { results } = await env.DB.prepare(
    `SELECT tag, COUNT(*) AS count
     FROM song_tag
     GROUP BY tag
     ORDER BY count DESC, tag ASC
     LIMIT ?`,
  ).bind(limit).all()
  const data = (results || []).map(row => ({ tag: row.tag, count: Number(row.count) || 0 }))
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/**
 * 歌曲标签列表 GET /api/song/tag?songId=xx
 * 返回该歌曲全部标签及使用人数，并标出当前用户是否已打该标签
 */
export async function handleGetSongTags(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const url = new URL(request.url)
  const songId = Number(url.searchParams.get('songId') || url.searchParams.get('id'))
  if (!songId) return jsonResp({ code: 400, msg: 'songId不能为空' })

  const { results } = await env.DB.prepare(
    `SELECT tag,
            COUNT(*) AS count,
            SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM song_tag
     WHERE song_id = ?
     GROUP BY tag
     ORDER BY count DESC, tag ASC
     LIMIT 50`,
  ).bind(userId, songId).all()

  const data = (results || []).map(row => ({
    tag: row.tag,
    count: Number(row.count) || 0,
    mine: Number(row.mine) > 0,
  }))
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 给歌曲打标签 POST /api/song/tag body: { songId, tag } */
export async function handleAddSongTag(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const songId = Number(body.songId)
  const tag = normalizeTag(body.tag)
  if (!songId) return jsonResp({ code: 400, msg: 'songId不能为空' })
  if (!tag) return jsonResp({ code: 400, msg: '标签需为 1-12 个字符' })

  const song = await env.DB.prepare('SELECT id FROM songs WHERE id = ?').bind(songId).first()
  if (!song) return jsonResp({ code: 404, msg: '歌曲不存在' })

  const exist = await env.DB.prepare(
    'SELECT id FROM song_tag WHERE song_id = ? AND tag = ? AND user_id = ?',
  ).bind(songId, tag, userId).first()
  if (!exist) {
    await env.DB.prepare(
      `INSERT INTO song_tag (song_id, tag, user_id, create_time) VALUES (?, ?, ?, DATETIME('now'))`,
    ).bind(songId, tag, userId).run()
  }
  return jsonResp({ code: 200, msg: exist ? '已添加过该标签' : '已添加标签' })
}

/** 取消自己的歌曲标签 POST /api/song/tag/delete body: { songId, tag } */
export async function handleDeleteSongTag(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const songId = Number(body.songId)
  const tag = normalizeTag(body.tag)
  if (!songId || !tag) return jsonResp({ code: 400, msg: '参数不完整' })

  const result = await env.DB.prepare(
    'DELETE FROM song_tag WHERE song_id = ? AND tag = ? AND user_id = ?',
  ).bind(songId, tag, userId).run()
  return jsonResp({ code: 200, msg: '已移除标签', data: { count: result.meta?.changes || 0 } })
}

/**
 * 管理员：标签列表 GET /api/admin/song-tags?keyword=&page=&pageSize
 * keyword 同时匹配标签、歌曲名、歌手与用户名
 */
export async function handleAdminListSongTags(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)

  const url = new URL(request.url)
  const keyword = String(url.searchParams.get('keyword') || '').trim()
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20))

  const conditions = []
  const binds = []
  if (keyword) {
    const like = `%${keyword}%`
    conditions.push(`(t.tag LIKE ? OR s.title LIKE ? OR s.artist LIKE ? OR u.username LIKE ?)`)
    binds.push(like, like, like, like)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const from = `FROM song_tag t
    LEFT JOIN songs s ON s.id = t.song_id
    LEFT JOIN users u ON u.id = t.user_id`

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total ${from} ${where}`).bind(...binds).first()
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.song_id, t.tag, t.user_id, t.create_time,
            s.title, s.artist, s.cover_url, u.username
     ${from} ${where}
     ORDER BY t.id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, pageSize, (page - 1) * pageSize).all()

  return jsonResp({
    code: 200,
    data: {
      list: results || [],
      total: Number(totalRow?.total) || 0,
      page,
      pageSize,
    },
  })
}

/** 管理员：删除单条标签 POST /api/admin/song-tag/delete body: { id } */
export async function handleAdminDeleteSongTag(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return jsonResp({ code: 400, msg: '参数不完整' })
  await env.DB.prepare('DELETE FROM song_tag WHERE id = ?').bind(id).run()
  return jsonResp({ code: 200, msg: '已删除' })
}

/** 管理员：删除某个标签名的全部记录 POST /api/admin/song-tag/delete-tag body: { tag } */
export async function handleAdminDeleteSongTagByName(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const tag = normalizeTag(body.tag)
  if (!tag) return jsonResp({ code: 400, msg: '标签不能为空' })
  const result = await env.DB.prepare('DELETE FROM song_tag WHERE tag = ?').bind(tag).run()
  return jsonResp({ code: 200, msg: '已删除该标签', data: { count: result.meta?.changes || 0 } })
}

/** 主题色结果缓存（Workers isolate 级别，避免重复下载解码封面） */
