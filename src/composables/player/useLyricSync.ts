/**
 * 歌词同步 —— 远程歌词获取、按时间轴高亮、自动滚动
 *
 * 职责：
 *  - 切歌时拉取当前歌曲歌词（命中缓存立即返回）
 *  - 同步预加载下一首歌词，切歌零等待
 *  - 联动封面主题色到全局 CSS 变量
 *  - 按歌词时间轴（LyricLine.time）计算当前高亮行；无歌词时回退 5 秒推进一行
 */
import type { Song } from '@/types/music'
import { fetchLyric, prefetchLyric } from '@/services/lyric-cache'
import { prefetchThemeColor, syncThemeColor } from '@/services/theme-color'
import { usePlayerStore } from '@/stores/player'
import { nextTick, ref, watch } from 'vue'

/** 取歌词文本行数组（LyricLine[] → string[]），无歌词时返回占位 */
export function resolveLyricLines(song: Song): string[] {
  const list = song.lyricList
  if (list?.length)
    return list.map(line => line.txt || ' ')
  return [`♪ ${song.title} ♪`, song.singer, '（暂无歌词）']
}

export function useLyricSync() {
  const player = usePlayerStore()

  /** 当前高亮歌词行索引 */
  const currentLine = ref(0)
  /** 歌词滚动容器（songId → DOM） */
  const lyricContainers = new Map<string | number, HTMLElement>()

  /** 注册歌词容器（模板 ref 回调） */
  function registerLyricContainer(songId: string | number | undefined, el: HTMLElement | null) {
    if (!songId)
      return
    if (el)
      lyricContainers.set(songId, el)
    else
      lyricContainers.delete(songId)
  }

  /**
   * 切歌时：
   *  1. 拉取当前歌歌词
   *  2. 提取封面主题色并应用全局
   *  3. 预加载下一首歌词与主题色（切歌时背景色可立即切换）
   */
  watch(() => player.currentSong?.id, async () => {
    const song = player.currentSong
    if (!song)
      return

    currentLine.value = 0
    // 当前歌词（远程或缓存）
    await fetchLyric(song)
    // 封面主题色联动
    syncThemeColor(song)
    // 预加载下一首的歌词与主题色
    const nextIdx = player.nextIndex()
    const nextSong = nextIdx >= 0 ? player.playList[nextIdx] : null
    prefetchLyric(nextSong)
    prefetchThemeColor(nextSong)
  }, { immediate: true })

  /** 按歌词时间轴推进高亮行；无时间轴时 5 秒推进一行 */
  watch(() => player.currentTime, (time) => {
    const song = player.currentSong
    if (!song?.id)
      return
    const list = song.lyricList
    const lines = resolveLyricLines(song)
    if (!lines.length)
      return

    if (list?.length) {
      // 二分查找最后一个 time <= currentTime 的行
      let lo = 0
      let hi = list.length - 1
      let idx = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (list[mid].time <= time) {
          idx = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      currentLine.value = idx
    } else {
      currentLine.value = Math.floor(time / 5) % lines.length
    }
  })

  /** 当前行滚动到容器顶部（末行受最大滚动距离限制，添加底部留白后也能贴顶） */
  watch(currentLine, async (index) => {
    const song = player.currentSong
    if (!song || index < 0)
      return
    const container = lyricContainers.get(song.id)
    if (!container)
      return
    await nextTick()
    const target = container.querySelectorAll('.lyric-line')[index] as HTMLElement | undefined
    if (!target)
      return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const offset = targetRect.top - containerRect.top + container.scrollTop
    const maxScroll = container.scrollHeight - container.clientHeight
    container.scrollTo({ top: Math.max(0, Math.min(offset, maxScroll)), behavior: 'smooth' })
  })

  return { currentLine, registerLyricContainer }
}
