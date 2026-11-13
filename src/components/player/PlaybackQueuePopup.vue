<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    class="queue-popup"
    :style="{ height: '100%' }"
  >
    <div class="queue-wrap" :style="dragStyle">
      <div class="queue-topbar" v-on="dragHandlers">
        <div class="drag-bar" />
      </div>

      <div class="quick-row">
        <div class="quick-item" @click="emit('openAddToPlaylist')">
          <div class="quick-circle">
            <van-icon name="add-o" size="22" />
          </div>
          <span>加歌单</span>
        </div>

        <div class="quick-item" @click="emit('togglePlayMode')">
          <div class="quick-circle">
            <van-icon :name="playMode === 0 ? 'sort' : 'replay'" size="22" />
          </div>
          <span>{{ playMode === 0 ? '顺序播放' : '单曲循环' }}</span>
        </div>

        <div class="quick-item" @click="emit('share')">
          <div class="quick-circle">
            <van-icon name="share-o" size="22" />
          </div>
          <span>分享</span>
        </div>
      </div>

      <div class="queue-card">
        <div class="card-head">
          <h3 class="card-title">播放列表</h3>
          <button type="button" class="mode-pill" @click="emit('togglePlayMode')">
            <van-icon :name="playMode === 0 ? 'sort' : 'replay'" size="13" />
            {{ playMode === 0 ? '顺序播放' : '单曲循环' }}
          </button>
        </div>

        <div class="song-scroll">
          <div
            v-for="(song, index) in player.playList"
            :key="song.id"
            class="song-row"
            :class="{ 'is-current': song.id === player.currentSong?.id }"
            @click="playSong(song.id)"
          >
            <div class="song-main">
              <p class="song-title">
                {{ song.title }}
              </p>
              <p class="song-meta">
                {{ song.singer }}<template v-if="song.album"> · {{ song.album }}</template>
              </p>
            </div>
            <div class="song-tail">
              <WaveBox
                v-if="song.id === player.currentSong?.id"
                :playing="player.isPlaying"
              />
              <van-icon
                v-else
                name="delete-o"
                size="18"
                class="del-btn"
                @click.stop="emit('removeSong', index)"
              />
            </div>
          </div>

          <p v-if="!player.playList.length" class="queue-empty">
            播放列表还是空的
          </p>
        </div>

        <p class="card-foot">
          共 {{ player.playList.length }} 首
        </p>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { usePlayerStore } from '@/stores/player'
import WaveBox from '@/components/waveBox/WaveBox.vue'
import { computed, ref } from 'vue'

defineProps<{
  playMode: number
}>()

const emit = defineEmits<{
  (e: 'togglePlayMode'): void
  (e: 'share'): void
  (e: 'removeSong', index: number): void
  (e: 'openAddToPlaylist'): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { playSong } = usePlaybackControl()

// ========== 顶部横杠：下拉拖动关闭 ==========
const dragY = ref(0)
const dragging = ref(false)
let startY = 0

const dragStyle = computed(() => ({
  transform: `translate3d(0, ${dragY.value}px, 0)`,
  transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
}))

function onDragStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  startY = touch.clientY
  dragging.value = true
}

function onDragMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch || !dragging.value)
    return
  dragY.value = Math.max(0, touch.clientY - startY)
}

function onDragEnd() {
  if (!dragging.value)
    return
  dragging.value = false
  if (dragY.value >= 110) {
    visible.value = false
    // 等弹层下滑动画结束再复位，避免下次打开位置异常
    setTimeout(() => {
      dragY.value = 0
    }, 320)
  } else {
    dragY.value = 0
  }
}

const dragHandlers = {
  touchstart: onDragStart,
  touchmove: onDragMove,
  touchend: onDragEnd,
  touchcancel: onDragEnd,
}
</script>

<style lang="scss" scoped>
.queue-popup {
  background: transparent !important;
}

.queue-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  color: var(--theme-text, #fff);
  background: var(--theme-background, #1a1a1a);
  touch-action: pan-y;
}

.queue-topbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
}

.drag-bar {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.5);
}

.quick-row {
  display: flex;
  gap: 30px;
  padding: 6px 4px 20px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  opacity: 0.85;
  cursor: pointer;

  .quick-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.18);
  }
}

.queue-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  border-radius: 16px;
  background: rgba(128, 128, 128, 0.12);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;

  .card-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.mode-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  color: inherit;
  background: rgba(128, 128, 128, 0.2);
}

.song-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.song-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;

  .song-main {
    flex: 1;
    min-width: 0;
  }

  .song-title {
    margin: 0;
    font-size: 15px;
    line-height: 1.3;
    opacity: 0.82;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-meta {
    margin: 3px 0 0;
    font-size: 12px;
    line-height: 1.3;
    opacity: 0.45;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.is-current .song-title {
    opacity: 1;
    font-weight: 500;
    color: #35c46a;
  }

  .song-tail {
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
    width: 28px;
  }

  .del-btn {
    opacity: 0.45;
  }
}

.queue-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  opacity: 0.4;
}

.card-foot {
  margin: 0;
  padding: 10px 0 14px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}
</style>
