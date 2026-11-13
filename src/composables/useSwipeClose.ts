/**
 * 右滑关闭 —— 用于从右侧弹出的全屏弹层
 */
import { computed, ref } from 'vue'

interface SwipeCloseOptions {
  /** 触发关闭的横向位移阈值（px） */
  threshold?: number
  /** 判定方向前需要的最小位移（px），用于过滤误触 */
  minDistance?: number
}

export function useSwipeClose(onClose: () => void, options: SwipeCloseOptions = {}) {
  const { threshold = 80, minDistance = 6 } = options

  const offsetX = ref(0)
  const dragging = ref(false)

  let startX = 0
  let startY = 0
  let decided = false
  let isHorizontal = false

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch)
      return
    startX = touch.clientX
    startY = touch.clientY
    decided = false
    isHorizontal = false
    offsetX.value = 0
    // 抬起手指前保持 transition: none，避免起步那一帧被 0.2s 过渡拖慢
    dragging.value = true
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch)
      return

    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (!decided) {
      if (Math.abs(dx) < minDistance && Math.abs(dy) < minDistance)
        return
      decided = true
      isHorizontal = dx > 0 && Math.abs(dx) > Math.abs(dy)
      if (!isHorizontal) {
        dragging.value = false
        return
      }
      // 以判定点为起点，消除起步时的位置跳跃
      startX = touch.clientX
      offsetX.value = 0
      return
    }

    if (!isHorizontal)
      return

    offsetX.value = Math.max(0, touch.clientX - startX)
  }

  function onTouchEnd() {
    const shouldClose = isHorizontal && offsetX.value >= threshold
    isHorizontal = false
    dragging.value = false
    offsetX.value = 0
    if (shouldClose)
      onClose()
  }

  const swipeStyle = computed(() => ({
    transform: `translate3d(${offsetX.value}px, 0, 0)`,
    transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
    willChange: 'transform',
  }))

  return {
    swipeStyle,
    // v-on 对象绑定的 key 必须是事件名本身（不能带 on 前缀）
    handlers: {
      touchstart: onTouchStart,
      touchmove: onTouchMove,
      touchend: onTouchEnd,
      touchcancel: onTouchEnd,
    },
  }
}
