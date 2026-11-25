/**
 * 每日听歌时长统计
 *
 * 只在真正播放时累计，按真实时间差结算（定时器被后台节流也不会丢时间），
 * 按天存储在 localStorage，跨天自动归零。
 */
import { usePlayerStore } from '@/stores/player'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'ani:listen-time'
/** 结算间隔：播放中每秒累加一次 */
const TICK = 1000
/** 落盘间隔（毫秒）：避免每秒写 localStorage */
const PERSIST_INTERVAL = 10_000

interface ListenTimeRecord {
  /** YYYY-MM-DD */
  date: string
  /** 已听秒数 */
  seconds: number
}

function todayKey() {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function readRecord(): ListenTimeRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ListenTimeRecord
      if (parsed.date === todayKey() && Number.isFinite(parsed.seconds))
        return parsed
    }
  } catch {
    // 数据损坏时重新统计
  }
  return { date: todayKey(), seconds: 0 }
}

export function useListenTimeStat() {
  const player = usePlayerStore()

  const initial = readRecord()
  /** 今日累计秒数 */
  const seconds = ref(initial.seconds)
  let recordDate = initial.date
  let timer: ReturnType<typeof setInterval> | null = null
  let lastTickAt = 0
  let lastPersistAt = 0

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: recordDate, seconds: seconds.value }))
      lastPersistAt = Date.now()
    } catch {
      // 存储不可用时仅保留本次会话统计
    }
  }

  /** 跨天时把统计切到新的一天 */
  function rolloverIfNeeded() {
    const today = todayKey()
    if (today === recordDate)
      return
    recordDate = today
    seconds.value = 0
  }

  function tick() {
    const now = Date.now()
    const delta = (now - lastTickAt) / 1000
    lastTickAt = now
    if (delta > 0) {
      rolloverIfNeeded()
      seconds.value = Math.round(seconds.value + delta)
    }
    if (now - lastPersistAt >= PERSIST_INTERVAL)
      persist()
  }

  function startTimer() {
    if (timer)
      return
    lastTickAt = Date.now()
    timer = setInterval(tick, TICK)
  }

  /** 停止计时并结算最后一小段播放时间 */
  function stopTimer() {
    if (!timer)
      return
    clearInterval(timer)
    timer = null
    const delta = (Date.now() - lastTickAt) / 1000
    if (delta > 0) {
      rolloverIfNeeded()
      seconds.value = Math.round(seconds.value + delta)
    }
    persist()
  }

  watch(() => player.isPlaying, playing => playing ? startTimer() : stopTimer(), { immediate: true })

  onMounted(() => {
    window.addEventListener('pagehide', persist)
    persist()
  })

  onBeforeUnmount(() => {
    stopTimer()
    window.removeEventListener('pagehide', persist)
  })

  /** 展示文案：不到 1 分钟单独提示，其余按 小时/分钟 展示 */
  const listenTimeText = computed(() => {
    const total = Math.max(0, Math.round(seconds.value))
    if (total < 60)
      return '不到 1 分钟'
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    if (hours > 0)
      return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
    return `${minutes}分钟`
  })

  return { seconds, listenTimeText }
}
