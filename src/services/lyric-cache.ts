/**
 * 歌词缓存服务 —— 避免重复请求、支持下一首预加载。
 *
 *  职责：
 *  - 按 songId 缓存已解析的 LyricLine[]
 *  - 并发去重（同一首歌同时只会发一次请求）
 *  - 预加载下一首歌词，切歌时零等待
 */
import type { LyricLine, Song } from '@/types/music'
import { getLyricList, getSongDetail } from '@/api/music'

const lyricCache = new Map<string | number, LyricLine[]>()
const pending = new Map<string | number, Promise<LyricLine[]>>()

/**
 * 取一首歌的歌词（命中缓存直接返回，否则远程拉取并解析）。
 * 列表接口不返回歌词：播放时走歌曲详情，顺带补全收藏状态。
 */
export function fetchLyric(song: Song): Promise<LyricLine[]> {
  // 已挂载到 song 上
  if (song.lyricList?.length)
    return Promise.resolve(song.lyricList)

  const key = song.id

  // 命中缓存
  const cached = lyricCache.get(key)
  if (cached) {
    song.lyricList = cached
    return Promise.resolve(cached)
  }

  // 正在请求 —— 复用同一个 Promise
  const existing = pending.get(key)
  if (existing)
    return existing

  const task = (async () => {
    try {
      let raw = song.lrc
      if (!raw) {
        // 播放时从详情接口补齐：歌词 + 收藏状态
        const detail = await getSongDetail(key)
        raw = detail.lrc ?? ''
        song.lrc = raw
        if (typeof detail.favorite === 'boolean')
          song.favorite = detail.favorite
      }
      const lines = getLyricList(raw)
      lyricCache.set(key, lines)
      song.lyricList = lines
      return lines
    } catch (err) {
      console.warn('[lyric] 拉取歌词失败', song.id, err)
      const empty: LyricLine[] = []
      song.lyricList = empty
      return empty
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, task)
  return task
}

/**
 * 预加载指定歌曲的歌词（不阻塞，失败忽略）。
 * 通常在当前歌开始播放时调用，预取下一首。
 */
export function prefetchLyric(song?: Song | null) {
  if (!song)
    return
  // 已缓存则跳过
  if (lyricCache.has(song.id) || song.lyricList?.length)
    return
  fetchLyric(song).catch(() => {})
}

/** 清空缓存（切换账号 / 退出时调用） */
export function clearLyricCache() {
  lyricCache.clear()
  pending.clear()
}
