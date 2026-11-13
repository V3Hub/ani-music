<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** 是否播放中（false 时波形静止） */
  playing?: boolean
  /** 整体尺寸预设 */
  variant?: 'overlay' | 'mini' | 'large'
  /** 自定义颜色，默认白色 */
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  playing: true,
  variant: 'overlay',
  color: '#ffffff',
})

// 不同 variant 的锥形尺寸配置
// short = 两边短条高度，tall = 中间长条高度，width = 每根宽，gap = 间距
const SIZE_MAP = {
  // 叠在歌单/歌曲封面图上的波形（最常用）
  overlay: { short: 6, tall: 12, width: 3, gap: 2 },
  // PlayerBottomNav 中间按钮里的 mini 版
  mini: { short: 4, tall: 9, width: 2, gap: 2 },
  // 播放页大按钮上的波形
  large: { short: 8, tall: 18, width: 4, gap: 3 },
} as const

const size = computed(() => SIZE_MAP[props.variant])

const bars = computed(() => [
  { cls: 'bar-short', h: size.value.short },
  { cls: 'bar-tall', h: size.value.tall },
  { cls: 'bar-short', h: size.value.short },
])
</script>

<template>
  <div
    class="wave-box"
    :class="{ 'is-playing': playing }"
    :style="{ gap: `${size.gap}px` }"
  >
    <span
      v-for="(b, i) in bars"
      :key="i"
      :class="b.cls"
      :style="{
        height: `${b.h}px`,
        width: `${size.width}px`,
        background: color,
      }"
    />
  </div>
</template>

<style lang="scss" scoped>
.wave-box {
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    display: block;
    border-radius: 2px;
    transform-origin: center;
    animation: bar-bounce 1s ease-in-out infinite;
    // 默认静止；.is-playing 下才运行
    animation-play-state: paused;
    flex-shrink: 0;
  }

  &.is-playing span {
    animation-play-state: running;
  }
}

@keyframes bar-bounce {
  0%,
  100% {
    transform: scaleY(0.6);
  }
  50% {
    transform: scaleY(1);
  }
}
</style>
