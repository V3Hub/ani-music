/**
 * 音乐 API —— 推荐 / 收藏 / 播放记录 / 歌单 / 歌曲详情 / 搜索。
 *
 * 统一用 request 封装（axios）：
 *   - baseURL = VITE_API_BASE_URL
 *   - 自动携带 Bearer Token（来自 stores/user）
 *   - 响应 { code: 200, data } 由 unwrap 自动解包
 */
import type { PlaybackSource } from '@/constants/player-ui'
import type { LyricLine, PlaylistItem, Song } from '@/types/music'
import { request } from '@/utils/request'

/**
 * 示例歌单 —— 仅作降级兜底，后端可用时不会走到这里。
 */
export const demoPlaylist: Song[] = [
  {
    id: '1',
    title: 'SoundHelix Song 1',
    singer: 'SoundHelix',
    album: 'Demo',
    pic: 'https://picsum.photos/seed/ain1/200/200',
    lrc: '',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: '2',
    title: 'SoundHelix Song 2',
    singer: 'SoundHelix',
    album: 'Demo',
    pic: 'https://picsum.photos/seed/ain2/200/200',
    lrc: '',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: '3',
    title: 'SoundHelix Song 3',
    singer: 'SoundHelix',
    album: 'Demo',
    pic: 'https://picsum.photos/seed/ain3/200/200',
    lrc: '',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: '4',
    title: 'SoundHelix Song 4',
    singer: 'SoundHelix',
    album: 'Demo',
    pic: 'https://picsum.photos/seed/ain4/200/200',
    lrc: '',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: '5',
    title: 'SoundHelix Song 5',
    singer: 'SoundHelix',
    album: 'Demo',
    pic: 'https://picsum.photos/seed/ain5/200/200',
    lrc: '',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
]

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

export async function getRecommendList(): Promise<Song[]> {
  try {
    const data = await request.get<Song[]>('/api/recommend/hot')
    return attachLyrics(data || [])
  } catch (err) {
    console.warn('[music] getRecommendList 失败，使用示例数据', err)
    return [...demoPlaylist]
  }
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

/** 播放结束上报，用于热门榜统计；失败静默，不影响播放 */
export async function reportPlay(songId: number | string): Promise<void> {
  try {
    await request.post('/api/play/report', { id: songId })
  } catch {
    // 上报失败无需打扰用户
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

/** 单参数搜索，默认走 netease 源 */
export async function searchSongs(keyword: string): Promise<Song[]> {
  return searchMusic(keyword, 'netease')
}
