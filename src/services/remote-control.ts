/**
 * 全局键盘 & 电视遥控器事件处理。
 *
 *  按键映射：
 *    Enter / Space        → 播放 / 暂停
 *    MediaPlay / MediaPause → 同上（浏览器可捕获系统耳机 / 遥控器的媒体键）
 *    MediaNextTrack       → 下一首
 *    MediaPreviousTrack   → 上一首
 *    ArrowRight / Shift+ArrowRight → 快进 5s
 *    ArrowLeft  / Shift+ArrowLeft  → 快退 5s
 *    ArrowUp              → 音量 +5
 *    ArrowDown            → 音量 -5
 *    NumpadAdd / Equal    → 音量 +5
 *    NumpadSubtract / Minus → 音量 -5
 *    KeyF                 → 收藏 / 取消收藏（触发全局事件）
 *    KeyM                 → 切换播放模式（list / loop / random）
 *    Escape               → 关闭当前弹窗（触发全局事件）
 *
 *  任何聚焦在 input/textarea/contenteditable 上时，除 Media* 键外全部忽略，
 *  避免打字时误触发。
 */
import type { PlayMode } from '@/types/music'
import { next, prev, seek, setVolume, toggle } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'

/** 快进 / 快退步长（秒） */
const SEEK_STEP = 5
/** 音量步长（绝对量 0~1） */
const VOLUME_STEP = 0.05

/** 判断当前焦点是否是文本输入类元素 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement))
    return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
    return true
  if ((el as HTMLElement).isContentEditable)
    return true
  // Vant 的搜索框、picker 等带 contenteditable 或 input
  return !!el.closest('[contenteditable="true"], input, textarea, select')
}

function onKeyDown(e: KeyboardEvent) {
  const typing = isTypingTarget(document.activeElement)

  // Media 键系统级，不管是否在输入框都允许
  switch (e.code) {
    case 'MediaPlay':
    case 'MediaPause':
    case 'MediaPlayPause':
      e.preventDefault()
      toggle().catch(() => {})
      return
    case 'MediaNextTrack':
      e.preventDefault()
      next().catch(() => {})
      return
    case 'MediaPreviousTrack':
      e.preventDefault()
      prev().catch(() => {})
      return
  }

  if (typing)
    return

  const player = usePlayerStore()

  switch (e.code) {
    case 'Enter':
    case 'Space':
      e.preventDefault()
      toggle().catch(() => {})
      break

    case 'ArrowRight':
      if (e.shiftKey) {
        e.preventDefault()
        next().catch(() => {})
      } else {
        e.preventDefault()
        seek(player.currentTime + SEEK_STEP)
      }
      break

    case 'ArrowLeft':
      if (e.shiftKey) {
        e.preventDefault()
        prev().catch(() => {})
      } else {
        e.preventDefault()
        seek(player.currentTime - SEEK_STEP)
      }
      break

    case 'ArrowUp':
    case 'Equal':
    case 'NumpadAdd':
      e.preventDefault()
      setVolume(Math.min(1, player.volume + VOLUME_STEP))
      break

    case 'ArrowDown':
    case 'Minus':
    case 'NumpadSubtract':
      e.preventDefault()
      setVolume(Math.max(0, player.volume - VOLUME_STEP))
      break

    case 'KeyF': {
      e.preventDefault()
      const id = player.currentSong?.id
      if (id) {
        // 派发自定义事件，由组件监听执行收藏
        window.dispatchEvent(new CustomEvent('ain:favorite', { detail: { id } }))
      }
      break
    }

    case 'KeyM': {
      e.preventDefault()
      const modes: PlayMode[] = ['list', 'loop']
      const idx = modes.indexOf(player.playMode)
      const nextMode = modes[(idx + 1) % modes.length]
      player.setPlayMode(nextMode)
      break
    }

    case 'Escape':
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('ain:escape'))
      break

    default:
      break
  }
}

/**
 * 启用全局键盘 / 遥控器监听。
 * 通常在应用入口调用一次即可。
 */
export function enableRemoteControls() {
  window.addEventListener('keydown', onKeyDown)
}

/** 关闭监听（SSR / 卸载时） */
export function disableRemoteControls() {
  window.removeEventListener('keydown', onKeyDown)
}
