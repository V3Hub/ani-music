<template>
  <nav class="player-bottom-nav">
    <div
      v-for="item in navItems"
      :key="item.key"
      class="nav-item"
      :class="{ 'is-active': currentTab === item.key, 'is-center': item.key === 'music' }"
      @click="onItemClick(item.key)"
    >
      <template v-if="item.key === 'music'">
        <div class="play-trigger" :class="{ 'is-disabled': !canPlay }">
          <van-icon :name="isPlaying ? 'pause' : 'play'" size="18" color="#FFFFFF" />
        </div>
      </template>
      <template v-else>
        <span class="nav-label">{{ item.label }}</span>
      </template>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { PlayerNavItem } from '@/constants/player-ui'

const props = defineProps<{
  navItems: PlayerNavItem[]
  currentTab: string
  isPlaying: boolean
  canPlay: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', tab: string): void
  (e: 'togglePlayback'): void
}>()

/** 中间圆形按钮：在播放页直接播放/暂停，其它 Tab 先回到播放页 */
function onItemClick(tab: string) {
  if (tab !== 'music') {
    emit('navigate', tab)
    return
  }
  // 已在播放页且当前歌曲可播放时才切换播放/暂停，否则只做页签跳转
  if (props.currentTab === 'music' && props.canPlay)
    emit('togglePlayback')
  else
    emit('navigate', tab)
}
</script>

<style lang="scss" scoped>
.player-bottom-nav {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 10px;
  box-sizing: border-box;

  .nav-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    cursor: pointer;

    .nav-label {
      font-size: 15px;
      color: rgba(255, 255, 255, 0.6);
      transition: color 0.2s;
    }

    &.is-active .nav-label {
      color: #fff;
      font-weight: 600;
    }

    &.is-center {
      flex: 0 0 auto;
      width: 72px;
    }

    .play-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      border: 2px solid rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      box-sizing: border-box;

      &.is-disabled {
        opacity: 0.45;
      }
    }
  }
}
</style>
