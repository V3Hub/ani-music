<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    class="queue-popup"
    @closed="resetDrag"
  >
    <div class="queue-wrap" :style="dragStyle">
      <div class="queue-topbar" v-on="dragHandlers" @click="onTopbarClick">
        <div class="drag-bar" />
      </div>

      <div class="quick-row">
        <div class="quick-item" @click="emit('openAddToPlaylist')">
          <div class="quick-circle">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 6h12" />
              <path d="M4 12h9" />
              <path d="M4 18h7" />
              <path d="M17 14v7" />
              <path d="M13.5 17.5h7" />
            </svg>
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

        <div class="quick-item" @click="emit('download')">
          <div class="quick-circle">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 4v10" />
              <path d="m8 10.5 4 4 4-4" />
              <path d="M5 19h14" />
            </svg>
          </div>
          <span>下载</span>
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
            <div class="move-col">
              <button
                type="button"
                class="move-btn"
                :disabled="index === 0"
                @click.stop="move(index, index - 1)"
              >
                <van-icon name="arrow-up" />
              </button>
              <button
                type="button"
                class="move-btn"
                :disabled="index === player.playList.length - 1"
                @click.stop="move(index, index + 1)"
              >
                <van-icon name="arrow-down" />
              </button>
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
  (e: 'download'): void
  (e: 'removeSong', index: number): void
  (e: 'openAddToPlaylist'): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { playSong } = usePlaybackControl()

/** 调整播放队列顺序，仅影响当前播放队列 */
function move(from: number, to: number) {
  if (to < 0 || to >= player.playList.length)
    return
  player.moveSong(from, to)
}

// ========== 顶部横杠：下拉拖动关闭 / 点击关闭 ==========
const dragY = ref(0)
const dragging = ref(false)
let startY = 0
/** 本次交互是否发生了拖动：拖动松手后的 click 不当作“点击关闭” */
let dragged = false

const dragStyle = computed(() => ({
  transform: `translate3d(0, ${dragY.value}px, 0)`,
  transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
}))

function onDragStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  startY = touch.clientY
  dragged = false
  dragging.value = true
}

function onDragMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch || !dragging.value)
    return
  dragY.value = Math.max(0, touch.clientY - startY)
  if (dragY.value > 6)
    dragged = true
}

function onDragEnd() {
  if (!dragging.value)
    return
  if (dragY.value >= 110) {
    // 保持拖出位置直接关闭，让弹层顺势继续下滑，避免先回弹再关闭的抖动
    visible.value = false
    return
  }
  dragging.value = false
  dragY.value = 0
}

/** 关闭动画结束后复位位移：无过渡瞬间归零，避免下次打开残留偏移 */
function resetDrag() {
  dragY.value = 0
  requestAnimationFrame(() => {
    dragging.value = false
  })
}

const dragHandlers = {
  touchstart: onDragStart,
  touchmove: onDragMove,
  touchend: onDragEnd,
  touchcancel: onDragEnd,
}

/** 点击顶部横杠关闭：电脑端没有触摸手势时也能关掉弹层 */
function onTopbarClick() {
  if (dragged)
    return
  visible.value = false
}
</script>

<style lang="scss" scoped>
.queue-popup {
  height: 100%;
  background: transparent !important;

  // 电脑端：上下留白，弹层变成悬浮面板，点空白处即可关闭
  @media (min-width: 768px) {
    height: calc(100% - 48px);
  }
}

.queue-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  color: var(--theme-text, #fff);
  background: var(--popup-bg);
  touch-action: pan-y;

  @media (min-width: 768px) {
    border-radius: 20px;
  }
}

.queue-topbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  cursor: pointer;
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

  .move-col {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 4px;
  }

  .move-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 7px;
    font-size: 12px;
    line-height: 1;
    color: inherit;
    background: rgba(128, 128, 128, 0.18);
    opacity: 0.75;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.15s;

    &:active {
      transform: scale(0.92);
      background: rgba(128, 128, 128, 0.28);
    }

    &:disabled {
      opacity: 0.15;
      pointer-events: none;
    }
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
