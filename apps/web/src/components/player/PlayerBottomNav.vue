<template>
  <nav class="player-bottom-nav">
    <div
      v-for="item in navItems"
      :key="item.key"
      class="nav-item"
      :class="{
        'is-active': currentTab === item.key,
        'is-center': item.key === 'music',
        'is-mini': item.key === 'music' && !isOnPlayTab,
      }"
      @click="onItemClick(item.key)"
    >
      <template v-if="item.key === 'music'">
        <!-- ===== 播放页：白色描边圆圈 + play/pause 图标切换 ===== -->
        <div v-if="isOnPlayTab" class="play-trigger original" :class="{ 'is-disabled': !canPlay }">
          <van-icon v-if="!isPlaying || !canPlay" name="play" size="18" />
          <van-icon v-else name="pause" size="18" />
        </div>

        <!-- ===== 非播放页：小封面图标 + 锥形波形 ===== -->
        <template v-else>
          <div class="play-trigger mini" :class="{ 'is-disabled': !canPlay }">
            <van-image
              v-if="cover"
              class="cover-bg"
              :src="cover"
              width="20"
              height="20"
              fit="cover"
            >
              <template #error>
                <div class="cover-fallback">
                  <van-icon name="music-o" size="10" />
                </div>
              </template>
            </van-image>
            <div v-else class="cover-fallback">
              <van-icon name="music-o" size="10" />
            </div>

            <!-- 统一波形：播放时动画，暂停时静止 -->
            <div class="play-overlay">
              <WaveBox :playing="isPlaying && canPlay" variant="mini" />
            </div>
          </div>
          <span class="nav-label center-label">音乐</span>
        </template>
      </template>
      <template v-else>
        <span class="nav-label">{{ item.label }}</span>
      </template>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { PlayerNavItem } from '@/constants/player-ui'
import { computed } from 'vue'
import WaveBox from '@/components/waveBox/WaveBox.vue'

const props = defineProps<{
  navItems: PlayerNavItem[]
  currentTab: string
  isPlaying: boolean
  canPlay: boolean
  cover?: string
}>()

const emit = defineEmits<{
  (e: 'navigate', tab: string): void
  (e: 'togglePlayback'): void
}>()

const isOnPlayTab = computed(() => props.currentTab === 'music')

function onItemClick(tab: string) {
  if (tab === 'music') {
    if (props.currentTab === 'music' && props.canPlay) {
      emit('togglePlayback')
    } else {
      emit('navigate', 'music')
    }
  } else {
    emit('navigate', tab)
  }
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
    min-width: 0;
    overflow: hidden;
    height: 100%;
    cursor: pointer;

    .nav-label {
      font-size: 15px;
      white-space: nowrap;
      color: var(--theme-text, #fff);
      opacity: 0.6;
      transition:
        color 0.2s,
        opacity 0.2s;
    }

    &.is-active .nav-label {
      color: var(--theme-text, #fff);
      opacity: 1;
      font-weight: 600;
    }

    &.is-center {
      flex: 0 0 72px;
      width: 72px;
      height: 52px;
      overflow: hidden;
    }

    &.is-mini.is-center {
      gap: 3px;

      .center-label {
        opacity: 0.7;
        font-size: 13px;
        white-space: nowrap;
      }

      &.is-active .center-label {
        opacity: 1;
        font-weight: 600;
      }
    }
  }

  // ===== 播放页：白色描边圆圈 =====
  .play-trigger.original {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: transparent;
    color: #fff;
    box-sizing: border-box;
    transition: transform 0.15s ease;

    &:active {
      transform: scale(0.92);
    }

    &.is-disabled {
      opacity: 0.35;
    }
  }

  // ===== 非播放页：圆角方形小图标 =====
  .play-trigger.mini {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease;
    background: rgba(128, 128, 128, 0.22);

    &:active {
      transform: scale(0.92);
    }

    &.is-disabled {
      opacity: 0.4;
      box-shadow: none;
    }

    .cover-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 5px;
      overflow: hidden;
    }

    .cover-fallback {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 255, 255, 0.7);
      background: rgba(128, 128, 128, 0.25);
    }

    .play-overlay {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.85));
    }
  }
}
</style>
