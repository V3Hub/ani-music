/**
 * 音乐 API —— 推荐 / 收藏 / 播放记录 / 歌单 / 歌曲详情 / 搜索。
 *
 * 统一用 request 封装（axios）：
 *   - baseURL = VITE_API_BASE_URL
 *   - 自动携带 Bearer Token（来自 stores/user）
 *   - 响应 { code: 200, data } 由 unwrap 自动解包
 */
import type { PlaybackSource } from '@/constants/player-ui'
import type { LyricLine, PlaylistItem, Song, SongComment } from '@/types/music'
import { request } from '@/utils/request'

/**
 * 解析 LRC 格式歌词为时间轴数组。
 * 支持 [mm:ss.xx] 时间戳；同一行多个时间戳会拆成多行。
 */
export function getLyricList(lrc?: string): LyricLine[] {
  if (!lrc)
    return []
  const lines = lrc.split(/\r?\n/)
  const result: LyricLine[] = []
  const timeReg = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

  for (const line of lines) {
    const matches = [...line.matchAll(timeReg)]
    if (matches.length === 0)
      continue
    const text = line.replace(timeReg, '').trim()
    for (const m of matches) {
      const mm = Number(m[1])
      const ss = Number(m[2])
      const ms = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0
      const time = mm * 60 + ss + ms
      result.push({ time, txt: text })
    }
  }
  return result
}

/** 批量给歌曲挂载解析后的歌词（列表接口不再返回歌词，只有自带 lrc 时才解析） */
function attachLyrics<T extends { lrc?: string, lyricList?: LyricLine[] }>(list: T[]): T[] {
  list.forEach((item) => {
    if (item.lrc)
      item.lyricList = getLyricList(item.lrc)
  })
  return list
}

// ==================== 推荐 ====================

/**
 * 最热歌曲（听歌模式共用）
 * @param mode 听歌模式 / 场景标识，后端按模式调整热度排序：
 *   default 默认、familiar 熟悉、fresh 新鲜、library / emo / dj / sleep 场景
 * @param excludeIds 需要排除的歌曲 id：一轮 30 首播完后换新批次，避免重复
 */
export async function getRecommendList(mode = 'default', excludeIds: Array<number | string> = []): Promise<Song[]> {
  const data = await request.get<Song[]>('/api/recommend/hot', {
    params: {
      mode,
      _t: Date.now(),
      ...(excludeIds.length ? { exclude: excludeIds.join(',') } : {}),
    },
  })
  return attachLyrics(data || [])
}

// ==================== 收藏 ====================

export async function getFavoriteList(): Promise<Song[]> {
  const data = await request.get<Song[]>('/api/favorite/list')
  return attachLyrics(data || [])
}

export async function addSongToFavorite(songId: number | string): Promise<boolean> {
  try {
    await request.post('/api/favorite/add', { songId })
    return true
  } catch {
    return false
  }
}

export async function removeSongFromFavorite(songId: number | string): Promise<boolean> {
  try {
    await request.post('/api/favorite/remove', { songId })
    return true
  } catch {
    return false
  }
}

// ==================== 播放记录 ====================

export async function getPlayRecordList(): Promise<Song[]> {
  const data = await request.get<Song[]>('/api/playRecord/list')
  return attachLyrics(data || [])
}

export async function addSongToPlayRecord(songId: number | string): Promise<boolean> {
  try {
    await request.post('/api/playRecord/add', { songId })
    return true
  } catch {
    return false
  }
}

export async function removeSongFromPlayRecord(songId: number): Promise<boolean> {
  try {
    await request.post('/api/playRecord/remove', { songId })
    return true
  } catch {
    return false
  }
}

// ==================== 歌单 ====================

export async function createPlaylist(name: string, desc: string): Promise<boolean> {
  try {
    await request.post('/api/playlist/create', { name, desc })
    return true
  } catch {
    return false
  }
}

export async function createSubPlaylist(id: number | string): Promise<boolean> {
  try {
    await request.post('/api/subPlaylist/create', { id })
    return true
  } catch {
    return false
  }
}

export async function getPlaylistOwner(): Promise<PlaylistItem[]> {
  return request.get<PlaylistItem[]>('/api/playlist/owner')
}

export async function getPlaylistDetail(id: number | string): Promise<Song[]> {
  const data = await request.get<Song[]>('/api/playlist/detail', { params: { id } })
  return attachLyrics(data || [])
}

export async function addSongToPlaylist(id: number, playlistId: number): Promise<boolean> {
  try {
    await request.post('/api/playlist/add-song', { id, playlistId })
    return true
  } catch {
    return false
  }
}

export async function removeSongFromPlaylist(id: number, playlistId: number): Promise<boolean> {
  try {
    await request.post('/api/playlist/remove-song', { id, playlistId })
    return true
  } catch {
    return false
  }
}

/** 播放失败后把歌曲降到歌单末尾，返回降序后的 sort 值供后续恢复时做乐观锁校验 */
export async function demoteSongInPlaylist(id: number | string, playlistId: number): Promise<number | null> {
  try {
    const res = await request.post<{ demotedSort: number }>('/api/playlist/demote-song', { id, playlistId })
    return res?.demotedSort ?? null
  } catch {
    // 静默失败：降序只是体验优化
    return null
  }
}

/** 播放成功后恢复被降序歌曲的原始排序位置，expectedSort 为乐观锁（不传则退化为无条件恢复） */
export async function promoteSongInPlaylist(
  id: number | string,
  playlistId: number,
  expectedSort?: number,
): Promise<void> {
  try {
    await request.post('/api/playlist/promote-song', { id, playlistId, expectedSort })
  } catch {
    // 静默失败：恢复排序只是体验优化
  }
}

/** 歌单拥有者手动调整歌曲顺序，list 为调整后的完整歌曲数组 */
export async function sortPlaylistSongs(playlistId: number, list: Song[]): Promise<void> {
  await request.post('/api/playlist/sort-song', {
    playlistId,
    list: list.map(song => ({ id: song.id })),
  })
}

export async function deletePlaylist(id: number): Promise<boolean> {
  try {
    await request.post('/api/playlist/delete', { id })
    return true
  } catch {
    return false
  }
}

export async function deleteSubPlaylist(id: number): Promise<boolean> {
  try {
    await request.post('/api/subPlaylist/delete', { id })
    return true
  } catch {
    return false
  }
}

// ==================== 发现 ====================

export async function getPlaylistDiscover(): Promise<PlaylistItem[]> {
  return request.get<PlaylistItem[]>('/api/playlist/discover')
}

/** 搜索歌单（仅按歌单名称匹配） */
export async function searchPlaylists(keyword: string): Promise<PlaylistItem[]> {
  return request.get<PlaylistItem[]>('/api/playlist/search', { params: { keyword } })
}

/** 获取单个歌单信息（分享链接打开时使用） */
export async function getPlaylistInfo(id: number | string): Promise<PlaylistItem> {
  return request.get<PlaylistItem>('/api/playlist/info', { params: { id } })
}

/** 生成分享 token（加密后的 id，避免通过数字顺序刷取） */
export async function createShareToken(type: 'song' | 'playlist', id: number | string): Promise<{ token: string }> {
  return request.get<{ token: string }>('/api/share/token', { params: { type, id } })
}

/** 解析分享 token */
export async function resolveShareToken(token: string): Promise<{ type: 'song' | 'playlist', id: number }> {
  return request.get<{ type: 'song' | 'playlist', id: number }>('/api/share/resolve', { params: { token } })
}

/** 查询歌曲分享人数 */
export async function getSongShareCount(id: number | string): Promise<{ count: number }> {
  return request.get<{ count: number }>('/api/song/share', { params: { id } })
}

/** 记录一次分享，返回最新分享人数 */
export async function reportSongShare(id: number | string): Promise<{ count: number }> {
  return request.post<{ count: number }>('/api/song/share', { id })
}

/** 查询歌单分享人数 */
export async function getPlaylistShareCount(id: number | string): Promise<{ count: number }> {
  return request.get<{ count: number }>('/api/playlist/share', { params: { id } })
}

/** 记录一次歌单分享，返回最新分享人数 */
export async function reportPlaylistShare(id: number | string): Promise<{ count: number }> {
  return request.post<{ count: number }>('/api/playlist/share', { id })
}

// ==================== 评论 ====================

/** 评论列表；传 parentId 时返回该顶层评论下的回复 */
export async function getSongComments(params: {
  songId: number | string
  parentId?: number
  sort?: 'default' | 'latest'
  page?: number
  pageSize?: number
}): Promise<SongComment[]> {
  return request.get<SongComment[]>('/api/song/comment', { params })
}

/** 歌曲评论总数（含回复） */
export async function getSongCommentCount(songId: number | string): Promise<{ count: number }> {
  return request.get<{ count: number }>('/api/song/comment/count', { params: { songId } })
}

/** 发布评论 / 回复 */
export async function addSongComment(payload: {
  songId: number | string
  content: string
  parentId?: number
}): Promise<SongComment> {
  return request.post<SongComment>('/api/song/comment', payload)
}

/** 点赞 / 取消点赞 */
export async function toggleCommentLike(id: number): Promise<{ liked: boolean, likeCount: number }> {
  return request.post<{ liked: boolean, likeCount: number }>('/api/song/comment/like', { id })
}

/** 删除自己的评论（连同回复），返回删除条数 */
export async function deleteSongComment(id: number): Promise<{ count: number }> {
  return request.post<{ count: number }>('/api/song/comment/delete', { id })
}

// ==================== 歌曲 ====================

export async function getSongDetail(id: number | string): Promise<Song> {
  const data = await request.get<Song>('/api/song/detail', { params: { id } })
  data.lyricList = getLyricList(data.lrc)
  return data
}

/** 后端解析出的封面主题色（worker 内自行解码图片，无第三方依赖） */
export interface SongThemeColor {
  id: number
  pic: string
  color: string
  rgb: [number, number, number]
  /** true 表示取色失败、返回的是兜底调色板颜色 */
  fallback: boolean
}

/** 取歌曲封面主题色；失败返回 null，由调用方自行兜底 */
export async function getSongThemeColor(id: string | number): Promise<SongThemeColor | null> {
  try {
    return await request.get<SongThemeColor>('/api/song/theme-color', { params: { id } })
  } catch {
    return null
  }
}

/**
 * 上报歌曲缺失的元信息（总时长 / 主题色）
 * 后端只在字段为空时补写，失败静默，不影响播放
 */
export async function reportSongMeta(
  id: number | string,
  meta: { duration?: number, themeColor?: string },
): Promise<boolean> {
  try {
    await request.post('/api/song/meta', { id, ...meta })
    return true
  } catch {
    return false
  }
}

/** 远程获取 LRC 歌词文本（worker 歌词挂在歌曲详情里，无独立歌词接口） */
export async function getSongLyric(id: number | string): Promise<string> {
  try {
    const song = await request.get<Song>('/api/song/detail', { params: { id } })
    return song?.lrc || ''
  } catch (err) {
    console.warn('[music] getSongLyric 失败', err)
    return ''
  }
}

export async function addSearchSong(item: Song): Promise<Song> {
  const data = await request.post<Song>('/api/song/add', item)
  return data
}

// ==================== 搜索 ====================

export async function searchMusic(keyword: string, source: PlaybackSource): Promise<Song[]> {
  try {
    const data = await request.get<Song[]>('/api/music/search', {
      params: { keyword: keyword.trim(), source },
    })
    return data || []
  } catch (e) {
    console.error('音乐搜索失败:', e)
    return []
  }
}

// ==================== 兼容别名（供其他模块调用） ====================

/** fetchSongs 等价于 getRecommendList */
export const fetchSongs = getRecommendList

/** 搜索歌曲，按当前播放源请求对应音源 */
export async function searchSongs(keyword: string, source: PlaybackSource = 'netease'): Promise<Song[]> {
  return searchMusic(keyword, source)
}
