/**
 * 弹层下拉关闭手势 —— 底部弹层 / 居中弹层通用
 *
 * 用法：
 *  const { dragStyle, handlers, reset } = useSwipeDownClose({ onClose, threshold: 80 })
 *  把 dragStyle 绑到需要跟手移动的容器（通常是整个弹层），handlers 绑到可拖动的区域，
 *  在弹层 @closed 时调用 reset() 复位位移。
 */
import { computed, ref } from 'vue'

export interface SwipeDownCloseOptions {
  /** 位移超过阈值后触发关闭 */
  onClose: () => void
  /** 触发关闭的纵向位移阈值（px），默认 80 */
  threshold?: number
  /** 判定方向前需要的最小位移（px），默认 0：按下即跟手 */
  minDistance?: number
  /** 从这些元素上开始的触摸不接管（如内部滚动列表） */
  ignoreSelector?: string
  /** 返回 false 时不接管本次手势（如列表还没滚到顶部） */
  canStart?: (event: TouchEvent) => boolean
  /** 要求手势先向下且以纵向为主，过滤横向滑动；默认 false */
  lockDirection?: boolean
  /** 向下拖动时阻止页面级滚动；默认 true */
  preventScroll?: boolean
}

export function useSwipeDownClose(options: SwipeDownCloseOptions) {
  const {
    onClose,
    threshold = 80,
    minDistance = 0,
    ignoreSelector,
    canStart,
    lockDirection = false,
    preventScroll = true,
  } = options

  const dragY = ref(0)
  const dragging = ref(false)
  /** 本次手势是否发生过拖动：拖动结束后的 click 不应再触发点击逻辑 */
  const dragged = ref(false)

  let startX = 0
  let startY = 0
  let active = false
  let locked = false

  function onTouchStart(event: TouchEvent) {
    active = false
    const touch = event.touches[0]
    if (!touch)
      return
    const target = event.target as HTMLElement | null
    if (ignoreSelector && target?.closest(ignoreSelector))
      return
    if (canStart && !canStart(event))
      return
    startX = touch.clientX
    startY = touch.clientY
    dragY.value = 0
    dragged.value = false
    locked = false
    active = true
    dragging.value = true
  }

  function onTouchMove(event: TouchEvent) {
    if (!active)
      return
    const touch = event.touches[0]
    if (!touch)
      return
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (!locked) {
      if (Math.abs(dx) < minDistance && Math.abs(dy) < minDistance)
        return
      if (lockDirection) {
        // 只接管「向下且以纵向为主」的手势，其余交给页面
        if (dy <= 0 || Math.abs(dx) > dy) {
          active = false
          dragging.value = false
          return
        }
        // 从判定点重新起算，避免起步跳动
        startY = touch.clientY
        locked = true
        return
      }
      locked = true
    }

    if (dy > 6)
      dragged.value = true
    dragY.value = Math.max(0, touch.clientY - startY)
    if (preventScroll && dy > 0 && event.cancelable)
      event.preventDefault()
  }

  function onTouchEnd() {
    if (!active)
      return
    active = false
    if (dragY.value >= threshold) {
      // 保持拖出位置直接关闭，避免先回弹再关闭的抖动
      onClose()
      return
    }
    dragging.value = false
    dragY.value = 0
  }

  function onTouchCancel() {
    active = false
    dragging.value = false
    dragY.value = 0
  }

  /** 关闭动画结束后复位位移：无过渡瞬间归零，避免下次打开残留偏移 */
  function reset() {
    active = false
    dragY.value = 0
    requestAnimationFrame(() => {
      dragging.value = false
    })
  }

  /** 上一次按下后是否发生了拖动（避免拖动结束误触发点击关闭） */
  function wasDragged() {
    return dragged.value
  }

  const dragStyle = computed(() => ({
    transform: `translate3d(0, ${dragY.value}px, 0)`,
    transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
  }))

  return {
    dragStyle,
    reset,
    wasDragged,
    // v-on 对象绑定的 key 必须是事件名本身（不能带 on 前缀）
    handlers: {
      touchstart: onTouchStart,
      touchmove: onTouchMove,
      touchend: onTouchEnd,
      touchcancel: onTouchCancel,
    },
  }
}
