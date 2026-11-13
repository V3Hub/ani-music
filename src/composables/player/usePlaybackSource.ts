/**
 * 播放设置 —— 设置弹层与各选项
 */
import type { PlaybackSource } from '@/constants/player-ui'
import { PLAYBACK_SOURCES } from '@/constants/player-ui'
import { pause } from '@/services/audio-player'
import { computed, onUnmounted, ref } from 'vue'

const SLEEP_STORAGE_KEY = 'ani-music:sleep-minutes'
/** 定时关闭预设选项（分钟数；0 表示关闭） */
export const SLEEP_OPTIONS = [0, 10, 20, 30, 60, 90]
export const SLEEP_LABELS = ['关闭', '10 分钟', '20 分钟', '30 分钟', '60 分钟', '90 分钟', '自定义']

export function usePlaybackSource() {
  const settingsVisible = ref(false)
  const source = ref<PlaybackSource>('netease')
  const pickerVisible = ref(false)

  /** 定时关闭分钟数（0 = 关闭） */
  const sleepMinutes = ref<number>(Number(localStorage.getItem(SLEEP_STORAGE_KEY) ?? 0))
  /** 定时关闭剩余毫秒（用于展示倒计时） */
  const sleepRemaining = ref(0)
  let sleepTimer: ReturnType<typeof setTimeout> | null = null
  let sleepTick: ReturnType<typeof setInterval> | null = null

  const sourceOptions = computed(() => PLAYBACK_SOURCES)
  const currentSourceLabel = computed(
    () => PLAYBACK_SOURCES.find(item => item.value === source.value)?.label ?? source.value,
  )

  /** 定时关闭当前状态标签 */
  const sleepLabel = computed(() => {
    if (sleepMinutes.value === 0)
      return '关闭'
    if (sleepMinutes.value === -1)
      return '自定义'
    if (sleepRemaining.value > 0) {
      const total = Math.round(sleepRemaining.value / 60000)
      if (total <= 1)
        return '1 分钟后停止'
      return `${total} 分钟后停止`
    }
    return `${sleepMinutes.value} 分钟后停止`
  })

  function openSettings() {
    settingsVisible.value = true
  }

  function closeSettings() {
    settingsVisible.value = false
  }

  function openSourcePicker() {
    pickerVisible.value = true
  }

  function closeSourcePicker() {
    pickerVisible.value = false
  }

  /** 音源选择器确认（直接传 value） */
  function confirmSource(sourceValue: string) {
    const matched = PLAYBACK_SOURCES.find(item => item.value === sourceValue)
    if (matched) source.value = matched.value
    pickerVisible.value = false
  }

  /** 启动 / 停止定时关闭（minutes = 0 时关闭） */
  function setSleepTimer(minutes: number) {
    // 清理旧定时器
    if (sleepTimer) {
      clearTimeout(sleepTimer)
      sleepTimer = null
    }
    if (sleepTick) {
      clearInterval(sleepTick)
      sleepTick = null
    }
    sleepRemaining.value = 0

    sleepMinutes.value = minutes
    localStorage.setItem(SLEEP_STORAGE_KEY, String(minutes))

    if (minutes <= 0)
      return

    const ms = minutes * 60 * 1000
    const started = Date.now()
    sleepRemaining.value = ms
    sleepTimer = setTimeout(() => {
      // 触发暂停
      pause()
      sleepRemaining.value = 0
      sleepMinutes.value = 0
      localStorage.setItem(SLEEP_STORAGE_KEY, '0')
      if (sleepTick) {
        clearInterval(sleepTick)
        sleepTick = null
      }
    }, ms)

    // 每秒刷新剩余时间显示
    sleepTick = setInterval(() => {
      const remain = ms - (Date.now() - started)
      sleepRemaining.value = Math.max(0, remain)
    }, 1000)
  }

  onUnmounted(() => {
    if (sleepTimer)
      clearTimeout(sleepTimer)
    if (sleepTick)
      clearInterval(sleepTick)
  })

  return {
    settingsVisible,
    source,
    pickerVisible,
    sourceOptions,
    currentSourceLabel,
    sleepMinutes,
    sleepRemaining,
    sleepLabel,
    SLEEP_OPTIONS,
    openSettings,
    closeSettings,
    openSourcePicker,
    closeSourcePicker,
    confirmSource,
    setSleepTimer,
  }
}
