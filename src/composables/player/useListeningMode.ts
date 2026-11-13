/**
 * 听歌模式 —— 模式/场景选择与侧栏展开收起（支持左右滑动开合）
 */
import { LISTENING_MODES, LISTENING_SCENES } from '@/constants/player-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export const DEFAULT_MODE_NAME = '模式选择'

/** 侧栏最大展开宽度：小屏按视口比例收窄，避免把右侧内容挤没 */
const MAX_SIDEBAR_WIDTH = 300
const SIDEBAR_VIEWPORT_RATIO = 0.78
/** 判定为横向滑动的最小位移 */
const DIRECTION_THRESHOLD = 8
/** 松手时超过该比例即保持展开，否则收起 */
const OPEN_RATIO = 0.35

export function useListeningMode() {
  const isCollapsed = ref(true)
  const currentMode = ref('default')
  const modeList = computed(() => LISTENING_MODES)
  const sceneList = computed(() => LISTENING_SCENES)

  const currentModeName = computed(() => {
    if (!currentMode.value || currentMode.value === 'default')
      return DEFAULT_MODE_NAME
    return LISTENING_MODES.find(mode => mode.value === currentMode.value)?.label
      || LISTENING_SCENES.find(scene => scene.value === currentMode.value)?.label
      || ''
  })

  /** 侧栏当前渲染宽度（px）：拖动过程中实时变化 */
  const sidebarWidth = ref(0)
  /** 是否正在拖动：拖动时关闭过渡，保证跟手 */
  const dragging = ref(false)
  const maxWidth = ref(getMaxWidth())

  function getMaxWidth() {
    const vw = typeof window === 'undefined' ? 375 : window.innerWidth
    return Math.min(MAX_SIDEBAR_WIDTH, Math.round(vw * SIDEBAR_VIEWPORT_RATIO))
  }

  function setCollapsed(collapsed: boolean) {
    isCollapsed.value = collapsed
    sidebarWidth.value = collapsed ? 0 : maxWidth.value
  }

  function toggleSidebar() {
    setCollapsed(!isCollapsed.value)
  }

  function syncMaxWidth() {
    maxWidth.value = getMaxWidth()
    if (!isCollapsed.value)
      sidebarWidth.value = maxWidth.value
  }

  // ========== 左滑关闭手势（只关不开） ==========
  let startX = 0
  let startY = 0
  let startWidth = 0
  /** 已按下且可能是滑动 */
  let tracking = false
  /** 已确认为横向滑动 */
  let horizontal = false

  function resetGesture() {
    tracking = false
    horizontal = false
    dragging.value = false
  }

  function onTouchStart(event: TouchEvent) {
    if (isCollapsed.value || event.touches.length !== 1)
      return

    const { clientX, clientY } = event.touches[0]

    // 仅在侧栏区域内按下才允许左滑关闭
    if (clientX > sidebarWidth.value)
      return

    startX = clientX
    startY = clientY
    startWidth = sidebarWidth.value
    tracking = true
    horizontal = false
  }

  function onTouchMove(event: TouchEvent) {
    if (!tracking || event.touches.length !== 1)
      return

    const { clientX, clientY } = event.touches[0]

    if (!horizontal) {
      const dx = clientX - startX
      const dy = clientY - startY
      if (Math.abs(dx) < DIRECTION_THRESHOLD && Math.abs(dy) < DIRECTION_THRESHOLD)
        return
      // 竖向手势交还给内部滚动 / Swiper
      if (Math.abs(dy) >= Math.abs(dx)) {
        resetGesture()
        return
      }
      // 确认横向手势：以当前位置为起点，避免起步跳变
      horizontal = true
      dragging.value = true
      startX = clientX
      startWidth = sidebarWidth.value
      return
    }

    const next = startWidth + (clientX - startX)
    sidebarWidth.value = Math.min(maxWidth.value, Math.max(0, next))
  }

  function onTouchEnd() {
    if (horizontal)
      setCollapsed(sidebarWidth.value > maxWidth.value * OPEN_RATIO)
    resetGesture()
  }

  const swipeHandlers = {
    touchstart: onTouchStart,
    touchmove: onTouchMove,
    touchend: onTouchEnd,
    touchcancel: onTouchEnd,
  }

  onMounted(() => {
    syncMaxWidth()
    window.addEventListener('resize', syncMaxWidth)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncMaxWidth)
  })

  return {
    isCollapsed,
    sidebarWidth,
    dragging,
    currentMode,
    modeList,
    sceneList,
    currentModeName,
    toggleSidebar,
    swipeHandlers,
  }
}
