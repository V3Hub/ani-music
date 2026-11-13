/**
 * 歌曲元信息补全上报
 *
 * 列表接口不返回「总时长 / 主题色」，客户端在播放时拿到这两项后回传给后端：
 *  - 总时长：audio 的 loadedmetadata
 *  - 主题色：封面取色 / 后端解析
 * 上报成功的结果记到 localStorage，跨会话不再重复请求。
 */
import type { Song } from '@/types/music'
import { reportSongMeta } from '@/api/music'

const STORAGE_KEY = 'ani:song-meta-reported'
/** 单类记录上限，超出后丢弃最早的，避免 localStorage 无限增长 */
const MAX_RECORDS = 600
/** 取色失败时的兜底色，没有上报价值 */
const INVALID_COLOR = '#000000'

interface ReportedMap {
  duration: Record<string, number>
  theme: Record<string, string>
}

function loadReported(): ReportedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Partial<ReportedMap>
      return { duration: data.duration ?? {}, theme: data.theme ?? {} }
    }
  } catch {
    // 数据损坏时重建
  }
  return { duration: {}, theme: {} }
}

const reported = loadReported()

/** 本次会话已发起过上报的歌曲，避免同一首歌反复请求 */
const sessionDuration = new Set<string>()
const sessionTheme = new Set<string>()

function trim(map: Record<string, unknown>) {
  const keys = Object.keys(map)
  if (keys.length > MAX_RECORDS)
    keys.slice(0, keys.length - MAX_RECORDS).forEach(key => delete map[key])
}

function saveReported() {
  trim(reported.duration)
  trim(reported.theme)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reported))
  } catch {
    // 存储不可用时只保留本次会话内的去重
  }
}

/** 上报歌曲总时长（秒）：歌曲本身没有时长时才上报 */
export function reportSongDuration(song: Song | null | undefined, duration: number) {
  if (!song || !(duration > 0))
    return
  // 接口已给出真实时长，无需上报
  if (Number(song.duration) > 0)
    return

  const key = String(song.id)
  const rounded = Math.round(duration)
  if (sessionDuration.has(key) || reported.duration[key] === rounded)
    return

  sessionDuration.add(key)
  reportSongMeta(song.id, { duration: rounded }).then((ok) => {
    if (!ok) {
      // 失败允许下次播放重试
      sessionDuration.delete(key)
      return
    }
    song.duration = rounded
    reported.duration[key] = rounded
    saveReported()
  })
}

/** 上报歌曲主题色：本地算出的颜色才上报，失败可重试 */
export function reportSongThemeColor(song: Song | null | undefined, color: string) {
  if (!song || !color)
    return
  const normalized = color.toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(normalized) || normalized === INVALID_COLOR)
    return

  const key = String(song.id)
  if (sessionTheme.has(key) || reported.theme[key] === normalized)
    return

  sessionTheme.add(key)
  reportSongMeta(song.id, { themeColor: normalized }).then((ok) => {
    if (!ok) {
      sessionTheme.delete(key)
      return
    }
    reported.theme[key] = normalized
    saveReported()
  })
}
