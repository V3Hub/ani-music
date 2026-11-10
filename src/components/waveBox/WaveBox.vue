<script setup lang="ts">
interface Props {
  /** 容器高度（同时决定波纹幅度），单位 px */
  size?: number
  /** 波纹条数量 */
  bars?: number
  /** 是否播放中（false 时动画暂停） */
  playing?: boolean
  /** 波纹颜色 */
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 10,
  bars: 3,
  playing: true,
  color: '#fff',
})
</script>

<template>
  <div
    class="wave-box"
    :class="{ 'is-paused': !props.playing }"
    :style="{
      height: `${props.size}px`,
      gap: `${Math.max(2, Math.round(props.size / 4))}px`,
    }"
  >
    <div
      v-for="i in props.bars"
      :key="i"
      class="bar"
      :style="{
        width: `${Math.max(2, Math.round(props.size / 5))}px`,
        background: props.color,
        animationDelay: `${(i - 1) * 0.2}s`,
      }"
    />
  </div>
</template>

<style lang="scss" scoped>
.wave-box {
  display: flex;
  align-items: flex-end;

  .bar {
    height: 100%;
    border-radius: 4px;
    transform-origin: center center;
    transform: scaleY(0.35);
    animation: wave-animate 0.6s ease-in-out infinite;
  }

  &.is-paused .bar {
    animation-play-state: paused;
  }
}

@keyframes wave-animate {
  0%,
  100% {
    transform: scaleY(0.35);
  }
  50% {
    transform: scaleY(1);
  }
}
</style>
