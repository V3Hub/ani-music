import type { Song } from '@/types/music'
/**
 * 播放器服务层 —— 单一事实来源
 *
 * 设计要点（见项目经验）：
 *  - 全局唯一 HTMLAudioElement 实例，禁止组件自行 new
 *  - 所有播放意图仅通过 play / pause / seek / next / prev 等方法触发
 *  - 进度、时长、播放状态由 audio 事件驱动，避免定时器漂移
 *  - 组件只与 Pinia store 响应式引用绑定，不直接操作 audio
 */
import { addSongToPlayRecord, reportPlay } from '@/api/music'
import { usePlayerStore } from '@/stores/player'
import { watch } from 'vue'

// 模块级单例 audio；preload=auto 才能在暂停时也产出缓冲进度与 canplay
const audio = new Audio()
audio.preload = 'auto'

let bound = false
/** 连续播放失败的歌曲数，整轮都失败时停止自动切歌，避免死循环 */
let failedCount = 0
/** 用户是否发起过播放：未发起时加载失败不自动切歌，避免一进页面就狂跳 */
let playRequested = false

/** 播放器 store：在 initPlayerService() 中一次性赋值，之后全局直接使用 */
let playerStore!: ReturnType<typeof usePlayerStore>

function bindEvents() {
  if (bound)
    return
  bound = true

  // 已拿到音频元数据：写入总时长（进度条最大值），并同步一次缓冲进度
  audio.addEventListener('loadedmetadata', () => {
    playerStore.setDuration(audio.duration || 0)
    syncBuffered()
  })

  // 浏览器下载/缓冲有进展：刷新已缓冲秒数，用于进度条的浅色缓冲段
  audio.addEventListener('progress', syncBuffered)

  // 当前帧已可播放：解锁进度条拖动（canplay=true）
  audio.addEventListener('canplay', () => {
    playerStore.setCanplay(true)
  })

  // 播放中约每秒触发 4 次：同步播放进度，驱动进度条与歌词高亮滚动
  audio.addEventListener('timeupdate', () => {
    playerStore.setCurrentTime(audio.currentTime)
  })

  // 开始播放（含恢复播放）：置为播放态，切换按钮图标与唱片动画
  audio.addEventListener('play', () => {
    playerStore.setPlaying(true)
    recordPlayHistory()
  })

  // 暂停（含切歌、锁屏暂停）：置为暂停态
  audio.addEventListener('pause', () => {
    playerStore.setPlaying(false)
  })

  // 当前歌曲自然播放结束：先上报播放记录，单曲循环则重播，否则按模式切下一首
  audio.addEventListener('ended', () => {
    playerStore.setPlaying(false)
    const song = playerStore.currentSong
    if (song)
      reportPlay(song.id).catch(() => {})
    handleEnded()
  })

  // 播放中被缓冲卡住（readyState 掉档）：暂时禁止拖动，等 canplay 恢复
  audio.addEventListener('waiting', () => {
    playerStore.setCanplay(false)
  })

  // 真正出声、缓冲跟上：解除等待态，并清零「连续失败计数」
  audio.addEventListener('playing', () => {
    playerStore.setCanplay(true)
    failedCount = 0
  })

  // 加载/解码失败（404、格式不支持、网络中断）：复位播放与拖动状态
  // 仅在用户已发起播放时自动切下一首，否则保持当前歌曲不动
  audio.addEventListener('error', () => {
    playerStore.setPlaying(false)
    playerStore.setCanplay(false)
    console.warn('[player] audio error', playerStore.currentSong?.url, audio.error)
    if (playRequested)
      autoNextOnError()
  })

  // 设置新 src 开始加载：缓冲进度归零、锁定拖动，直到新歌 canplay
  audio.addEventListener('loadstart', () => {
    playerStore.setBuffered(0)
    playerStore.setCanplay(false)
  })
}

/** 已写入播放历史的歌曲 id，避免同一首暂停/恢复时重复上报 */
let lastRecordedSongId: number | string | null = null

/** 写入播放历史：真正开始播放时上报一次，失败静默并允许下次重试 */
function recordPlayHistory() {
  const song = playerStore.currentSong
  if (!song || song.id === lastRecordedSongId)
    return
  lastRecordedSongId = song.id
  addSongToPlayRecord(song.id).catch(() => {
    lastRecordedSongId = null
  })
}

/** 同步已缓冲时长；readyState 足够时直接放开拖动 */
function syncBuffered() {
  const ranges = audio.buffered
  playerStore.setBuffered(ranges.length ? ranges.end(ranges.length - 1) : 0)
  if (audio.readyState >= audio.HAVE_CURRENT_DATA)
    playerStore.setCanplay(true)
}

function handleEnded() {
  if (playerStore.playMode === 'loop') {
    // 单曲循环
    audio.currentTime = 0
    audio.play().catch(() => {})
    return
  }
  // 列表顺序/随机：切到下一首
  const next = playerStore.nextIndex()
  if (next >= 0) {
    playerStore.setCurrentIndex(next)
    playCurrent().catch(() => {})
  }
}

/** 当前歌曲播放失败时自动切到下一首；整轮都失败则停止 */
function autoNextOnError() {
  const total = playerStore.playList.length
  if (total === 0)
    return

  failedCount += 1
  if (failedCount >= total) {
    failedCount = 0
    console.warn('[player] 所有歌曲均播放失败，停止自动切歌')
    return
  }

  const next = playerStore.nextIndex()
  if (next < 0)
    return
  playerStore.setCurrentIndex(next)
  playCurrent().catch(() => {})
}

// 确保事件只绑定一次（在应用启动时调用，必须早于其它导出方法）
export function initPlayerService() {
  playerStore = usePlayerStore()
  bindEvents()
  audio.volume = playerStore.volume

  // 当前歌曲变化（含 setPlayList 设好歌单）后立即加载 src 预缓冲，不播放
  watch(() => playerStore.currentSong?.url, (url) => {
    loadSource(url)
  }, { immediate: true })
}

/** 为指定地址预加载音频资源：只缓冲，不触发播放 */
function loadSource(url?: string) {
  if (!url || audio.src === url)
    return
  playerStore.setCanplay(false)
  playerStore.setBuffered(0)
  audio.src = url
  audio.load()
}

/** 设置音量 */
export function setVolume(v: number) {
  playerStore.setVolume(v)
  audio.volume = v
}

/** 播放指定歌曲（加入/替换歌单并播放） */
export async function play(song: Song, list?: Song[]) {
  if (list) {
    const idx = list.findIndex(s => s.id === song.id)
    playerStore.setPlayList(list, idx >= 0
      ? idx
      : 0)
  } else {
    // 如果当前歌单里已经有这首歌，直接定位
    const idx = playerStore.playList.findIndex(s => s.id === song.id)
    if (idx >= 0) {
      playerStore.setCurrentIndex(idx)
    } else {
      playerStore.setPlayList([song], 0)
    }
  }
  await playCurrent()
}

/** 按索引播放当前歌单 */
export async function playByIndex(index: number) {
  playerStore.setCurrentIndex(index)
  await playCurrent()
}

/** 播放当前 store 中 currentSong */
async function playCurrent() {
  const song = playerStore.currentSong
  if (!song)
    return

  // 记录播放意图：此后加载失败才允许自动切歌
  playRequested = true

  if (audio.src !== song.url) {
    playerStore.setCanplay(false)
    audio.src = song.url
  }

  try {
    await audio.play()
  } catch (err) {
    playerStore.setPlaying(false)
    console.warn('[player] play failed', err)
  }
}

/** 暂停 */
export function pause() {
  audio.pause()
}

/** 切换播放/暂停 */
export async function toggle() {
  if (!playerStore.currentSong)
    return
  if (playerStore.isPlaying) {
    pause()
  } else {
    await playCurrent()
  }
}

/** 上一首 */
export async function prev() {
  const idx = playerStore.prevIndex()
  if (idx >= 0) {
    playerStore.setCurrentIndex(idx)
    await playCurrent()
  }
}

/** 下一首 */
export async function next() {
  const idx = playerStore.nextIndex()
  if (idx >= 0) {
    playerStore.setCurrentIndex(idx)
    await playCurrent()
  }
}

/** 跳转进度（秒） */
export function seek(seconds: number) {
  if (!playerStore.currentSong)
    return
  audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds))
  playerStore.setCurrentTime(audio.currentTime)
}

/** 按百分比跳转 (0-100) */
export function seekByPercent(percent: number) {
  if (!playerStore.duration)
    return
  seek((percent / 100) * playerStore.duration)
}

/** 销毁（SSR/卸载场景） */
export function dispose() {
  playRequested = false
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}
