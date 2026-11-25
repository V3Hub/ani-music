<template>
  <Teleport to="body">
    <Transition name="viewer-fade">
      <div v-if="visible" class="img-viewer" @click.self="onBackdropClick">
        <img
          ref="imgEl"
          class="img-viewer__img"
          :class="{ 'is-dragging': dragging }"
          :src="src"
          alt=""
          :style="transformStyle"
          @click.stop
          @dblclick="toggleZoom"
          @wheel.prevent="onWheel"
          @touchstart="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
        >
        <button type="button" class="img-viewer__close" aria-label="关闭" @click.stop="close">
          <van-icon name="cross" size="20" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

interface Point {
  x: number
  y: number
}

const props = defineProps<{
  visible: boolean
  src: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_DELAY = 300

const imgEl = ref<HTMLImageElement | null>(null)
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

const transformStyle = computed(() => ({
  transform: `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})`,
}))

let startDistance = 0
let startScale = 1
let startMid: Point = { x: 0, y: 0 }
let startPoint: Point = { x: 0, y: 0 }
let startTx = 0
let startTy = 0
let pinched = false
let lastTap = 0

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function touchOf(list: TouchList, index: number) {
  return list.item(index) as Touch
}

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function midpoint(a: Touch, b: Touch): Point {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

/** 限制拖动范围，避免放大后把图片拖出屏幕 */
function clampTranslate() {
  const el = imgEl.value
  if (!el)
    return
  const maxX = Math.max(0, (el.offsetWidth * (scale.value - 1)) / 2)
  const maxY = Math.max(0, (el.offsetHeight * (scale.value - 1)) / 2)
  tx.value = clamp(tx.value, -maxX, maxX)
  ty.value = clamp(ty.value, -maxY, maxY)
}

function resetTransform() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
  dragging.value = false
  startDistance = 0
  startScale = 1
  pinched = false
  lastTap = 0
}

/** 双击 / 双指双击：在原始大小与 2.5 倍之间切换 */
function toggleZoom() {
  if (scale.value > 1) {
    resetTransform()
    return
  }
  scale.value = 2.5
  clampTranslate()
}

function onWheel(event: WheelEvent) {
  const step = event.deltaY > 0 ? -0.25 : 0.25
  scale.value = clamp(scale.value + step, MIN_SCALE, MAX_SCALE)
  if (scale.value === MIN_SCALE) {
    tx.value = 0
    ty.value = 0
    return
  }
  clampTranslate()
}

function onTouchStart(event: TouchEvent) {
  dragging.value = true
  if (event.touches.length >= 2) {
    const a = touchOf(event.touches, 0)
    const b = touchOf(event.touches, 1)
    startDistance = distance(a, b)
    startMid = midpoint(a, b)
    startScale = scale.value
    startTx = tx.value
    startTy = ty.value
    pinched = true
    return
  }
  const touch = touchOf(event.touches, 0)
  startPoint = { x: touch.clientX, y: touch.clientY }
  startTx = tx.value
  startTy = ty.value
}

function onTouchMove(event: TouchEvent) {
  if (event.touches.length >= 2 && startDistance > 0) {
    const a = touchOf(event.touches, 0)
    const b = touchOf(event.touches, 1)
    const mid = midpoint(a, b)
    const next = clamp(startScale * (distance(a, b) / startDistance), MIN_SCALE, MAX_SCALE)
    scale.value = next
    if (next === MIN_SCALE) {
      tx.value = 0
      ty.value = 0
      return
    }
    // 双指移动时跟着手指平移，保持缩放中心稳定
    tx.value = startTx + (mid.x - startMid.x)
    ty.value = startTy + (mid.y - startMid.y)
    clampTranslate()
    return
  }
  if (event.touches.length === 1 && scale.value > 1) {
    const touch = touchOf(event.touches, 0)
    tx.value = startTx + (touch.clientX - startPoint.x)
    ty.value = startTy + (touch.clientY - startPoint.y)
    clampTranslate()
  }
}

function onTouchEnd(event: TouchEvent) {
  if (event.touches.length > 0) {
    // 双指松开一指：重新以剩下的手指作为拖动起点
    if (event.touches.length === 1) {
      const touch = touchOf(event.touches, 0)
      startPoint = { x: touch.clientX, y: touch.clientY }
      startTx = tx.value
      startTy = ty.value
      startDistance = 0
    }
    return
  }
  dragging.value = false
  if (scale.value <= 1.02)
    resetTransform()

  // 触摸端没有可靠的 dblclick，这里手动判断双击
  const now = Date.now()
  if (!pinched && now - lastTap < DOUBLE_TAP_DELAY)
    toggleZoom()
  lastTap = pinched ? 0 : now
  pinched = false
}

function onBackdropClick() {
  // 放大状态下点空白处先不关闭，避免误触
  if (scale.value === 1)
    close()
}

function close() {
  emit('update:visible', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    close()
}

watch(() => props.visible, (show) => {
  if (show) {
    resetTransform()
    window.addEventListener('keydown', onKeydown)
    return
  }
  window.removeEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.img-viewer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.92);
  touch-action: none;
}

.img-viewer__img {
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
  transition: transform 0.2s ease;

  &.is-dragging {
    transition: none;
  }
}

.img-viewer__close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  cursor: pointer;
}

.viewer-fade-enter-active,
.viewer-fade-leave-active {
  transition: opacity 0.18s ease;
}

.viewer-fade-enter-from,
.viewer-fade-leave-to {
  opacity: 0;
}
</style>
