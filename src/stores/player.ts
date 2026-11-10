import type { PlayMode, Song } from '@/types/music'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  // ------- state -------
  const playList = ref<Song[]>([])
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(0.8)
  const playMode = ref<PlayMode>('list')
  /** 已缓冲时长（秒） */
  const buffered = ref(0)
  /** 是否已可播放：canplay 后为 true，切歌/等待/出错时为 false；同时决定进度条能否拖动 */
  const canplay = ref(false)

  // ------- computed -------
  const currentSong = computed<Song | null>(() => {
    if (currentIndex.value < 0 || currentIndex.value >= playList.value.length)
      return null
    return playList.value[currentIndex.value]
  })

  const progress = computed(() => {
    if (duration.value === 0)
      return 0
    return (currentTime.value / duration.value) * 100
  })

  /** 缓冲进度百分比 */
  const bufferedPercent = computed(() => {
    if (duration.value === 0)
      return 0
    return Math.min(100, (buffered.value / duration.value) * 100)
  })

  // ------- actions（由 player service 调用以保持单一入口） -------
  function setPlayList(list: Song[], startIndex = 0) {
    playList.value = list
    currentIndex.value = startIndex
  }

  function setCurrentIndex(index: number) {
    if (index >= 0 && index < playList.value.length) {
      currentIndex.value = index
    }
  }

  function setPlaying(value: boolean) {
    isPlaying.value = value
  }

  function setCurrentTime(t: number) {
    currentTime.value = t
  }

  function setDuration(d: number) {
    duration.value = d
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
  }

  function setPlayMode(mode: PlayMode) {
    playMode.value = mode
  }

  function setBuffered(seconds: number) {
    buffered.value = seconds
  }

  function setCanplay(value: boolean) {
    canplay.value = value
  }

  function nextIndex(): number {
    if (playList.value.length === 0)
      return -1
    const next = currentIndex.value + 1
    return next >= playList.value.length
      ? 0
      : next
  }

  function prevIndex(): number {
    if (playList.value.length === 0)
      return -1
    const prev = currentIndex.value - 1
    return prev < 0
      ? playList.value.length - 1
      : prev
  }

  return {
    // state
    playList,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    playMode,
    buffered,
    canplay,
    // computed
    currentSong,
    progress,
    bufferedPercent,
    // actions
    setPlayList,
    setCurrentIndex,
    setPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    setPlayMode,
    setBuffered,
    setCanplay,
    nextIndex,
    prevIndex,
  }
})
