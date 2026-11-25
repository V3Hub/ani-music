import { MAX_PLAYLIST_COUNT } from './config.js'
import { clearNotifications } from './notify.js'

export function mapSongRow(item, options = {}) {
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
  // 客户端上报过主题色时才带上，避免列表里出现空字段
  if (item.theme_color) song.themeColor = item.theme_color
  return song
}

/**
 * 往「用户歌曲列表」追加一条：超过上限时先淘汰 sort 最小（最早）的一条
 * @param {object} DB D1 数据库实例
 * @param {'user_play_record'|'user_favorite'} table 内部固定表名
 * @param {number} userId 用户 id
 * @param {number} total 当前条数
 */
export async function trimOldestIfFull(DB, table, userId, total) {
  if (total < MAX_PLAYLIST_COUNT) return
  await DB.prepare(`DELETE FROM ${table} WHERE user_id = ? ORDER BY sort ASC LIMIT 1`).bind(userId).run()
}

/**
 * 删除用户及其全部关联记录
 * 评论、心愿等表的 user_id 以文本存储，比较时同时匹配数字与字符串
 * @param {object} DB D1 数据库实例
 * @param {number} userId 用户 id
 */
export async function deleteUserCascade(DB, userId) {
  const id = Number(userId) || 0
  const text = String(userId)
  // 先清掉该用户收到 / 发出的站内通知
  await clearNotifications(DB, {
    sql: 'DELETE FROM user_notification WHERE user_id IN (?, ?) OR sender_id IN (?, ?)',
    params: [id, text, id, text],
  })
  await DB.batch([
    // 播放记录、收藏、分享
    DB.prepare('DELETE FROM user_play_record WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM user_favorite WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM share_user WHERE user_id = ?').bind(id),
    // 歌曲标签
    DB.prepare('DELETE FROM song_tag WHERE user_id = ?').bind(id),
    // 歌单：先删歌单内歌曲与订阅，再删歌单
    DB.prepare('DELETE FROM playlist_song WHERE playlist_id IN (SELECT id FROM user_playlist WHERE user_id = ?)').bind(id),
    DB.prepare('DELETE FROM user_playlist_sub WHERE playlist_id IN (SELECT id FROM user_playlist WHERE user_id = ?)').bind(id),
    DB.prepare('DELETE FROM user_playlist_sub WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM user_playlist WHERE user_id = ?').bind(id),
    // 评论：先清点赞与下属回复，再删自己的评论
    DB.prepare(
      `DELETE FROM song_comment_like
       WHERE user_id IN (?, ?)
          OR comment_id IN (SELECT id FROM song_comment WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare('DELETE FROM song_comment WHERE parent_id IN (SELECT id FROM song_comment WHERE user_id IN (?, ?))').bind(id, text),
    DB.prepare('DELETE FROM song_comment WHERE user_id IN (?, ?)').bind(id, text),
    // 心愿：先清心愿的点赞与留言，再删心愿本身
    DB.prepare(
      `DELETE FROM wish_like
       WHERE user_id IN (?, ?)
          OR wish_id IN (SELECT id FROM wish WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare(
      `DELETE FROM wish_message
       WHERE user_id IN (?, ?)
          OR wish_id IN (SELECT id FROM wish WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare('DELETE FROM wish WHERE user_id IN (?, ?)').bind(id, text),
    // VIP 记录、注册申请
    DB.prepare('DELETE FROM vip_record WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM registration_request WHERE user_id = ?').bind(id),
    // 最后删除用户本体
    DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
}

/** 路由表：path → method → 处理函数，统一由 fetch 分发 */
