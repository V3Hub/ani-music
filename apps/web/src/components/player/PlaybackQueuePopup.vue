<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    class="queue-popup"
    @closed="onClosed"
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
          <div v-if="!sorting" class="head-left">
            <h3 class="card-title">播放列表</h3>
            <span v-if="queueSource" class="card-source">来源 · {{ queueSource }}</span>
          </div>
          <h3 v-else class="card-title sort-title">拖动右侧手柄调整顺序</h3>
          <div class="head-actions">
            <button
              v-if="!sorting"
              type="button"
              class="mode-pill"
              @click="enterSort"
            >
              <van-icon name="bars" size="13" />
              排序
            </button>
            <template v-else>
              <button type="button" class="mode-pill sort-btn" @click="cancelSort">取消</button>
              <button
                type="button"
                class="mode-pill sort-btn sort-confirm"
                :class="{ 'is-disabled': saving }"
                @click="saveSort"
              >
                {{ saving ? '保存中…' : '完成' }}
              </button>
            </template>
          </div>
        </div>

        <div class="song-scroll">
          <div
            v-for="(song, index) in displayList"
            :key="song.id"
            class="song-row"
            :class="{ 'is-current': song.id === player.currentSong?.id, 'is-dragging': sorting && index === draggingIndex }"
            :style="sorting && index === draggingIndex ? { transform: `translateY(${dragY}px)` } : undefined"
            @click="onRowClick(song.id)"
          >
            <div class="song-main">
              <p class="song-title">
                {{ song.title }}
              </p>
              <p class="song-meta">
                {{ song.singer }}<template v-if="song.album"> · {{ song.album }}</template>
              </p>
            </div>
            <div v-if="sorting" class="song-tail">
              <van-icon
                name="bars"
                size="18"
                class="drag-handle"
                @touchstart.stop="onDragStart($event, index)"
              />
            </div>
            <template v-else>
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
            </template>
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
import { useSwipeDownClose } from '@/composables/useSwipeDownClose'
import { usePlayerStore } from '@/stores/player'
import WaveBox from '@/components/waveBox/WaveBox.vue'
import type { Song } from '@/types/music'
import { computed, ref } from 'vue'

defineProps<{
  playMode: number
  /** 当前队列来源：歌单名 / 听歌模式名 */
  queueSource?: string
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

// ========== 排序模式 ==========
const sorting = ref(false)
const saving = ref(false)
/** 排序模式下的本地副本，保存成功后才同步到 player.playList */
const localList = ref<Song[]>([])
const displayList = computed(() => sorting.value ? localList.value : player.playList)

function enterSort() {
  if (player.playList.length < 2)
    return
  localList.value = [...player.playList]
  sorting.value = true
}

function cancelSort() {
  sorting.value = false
}

function saveSort() {
  if (saving.value || player.playList.length === 0)
    return
  saving.value = true
  try {
    // 保存时需要保持当前播放歌曲不丢失
    const curId = player.currentSong?.id
    const curIndex = localList.value.findIndex(s => s.id === curId)
    player.setPlayList([...localList.value], curIndex >= 0 ? curIndex : player.currentIndex)
    sorting.value = false
  } finally {
    saving.value = false
  }
}

function onRowClick(id: string | number) {
  if (sorting.value)
    return
  playSong(id)
}

// ---- 触摸拖拽：从手柄按下后跟踪手指，越过半行与邻项交换 ----
const draggingIndex = ref(-1)
const dragY = ref(0)
let dragStartY = 0
let rowHeight = 0

function onDragStart(event: TouchEvent, index: number) {
  if (saving.value)
    return
  const target = event.currentTarget as HTMLElement
  const row = target.closest('.song-row') as HTMLElement | null
  rowHeight = row?.offsetHeight || 56
  draggingIndex.value = index
  dragStartY = event.touches[0].clientY
  dragY.value = 0
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
  window.addEventListener('touchcancel', onDragEnd)
}

function onDragMove(event: TouchEvent) {
  event.preventDefault()
  const list = localList.value
  const index = draggingIndex.value
  if (index < 0)
    return
  const dy = event.touches[0].clientY - dragStartY
  if (dy > rowHeight / 2 && index < list.length - 1) {
    list.splice(index, 2, list[index + 1], list[index])
    draggingIndex.value = index + 1
    dragStartY += rowHeight
  } else if (dy < -rowHeight / 2 && index > 0) {
    list.splice(index - 1, 2, list[index], list[index - 1])
    draggingIndex.value = index - 1
    dragStartY -= rowHeight
  }
  dragY.value = event.touches[0].clientY - dragStartY
}

function onDragEnd() {
  draggingIndex.value = -1
  dragY.value = 0
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
  window.removeEventListener('touchcancel', onDragEnd)
}

/** 顶部横杠：下拉拖动关闭 / 点击关闭 */
const {
  dragStyle,
  handlers: dragHandlers,
  reset: resetDrag,
  wasDragged,
} = useSwipeDownClose({
  onClose: () => {
    visible.value = false
  },
  threshold: 110,
  preventScroll: false,
})

/** 抽屉关闭时彻底清理，避免残留状态 */
function onClosed() {
  onDragEnd()
  sorting.value = false
  saving.value = false
  resetDrag()
}

/** 点击顶部横杠关闭：电脑端没有触摸手势时也能关掉弹层 */
function onTopbarClick() {
  if (wasDragged())
    return
  visible.value = false
}
</script>

<style lang="scss" scoped>
.queue-popup {
  height: 100%;
  background: transparent !important;
}

.queue-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0 16px 16px;
  box-sizing: border-box;
  color: var(--theme-text, #fff);
  background: var(--popup-bg);
  touch-action: pan-y;
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
  width: 40px;
  height: 4px;
  border-radius: 999px;
  /* 跟随主题文字色：深浅背景下都清晰可见 */
  background: currentColor;
  opacity: 0.3;
}

.quick-row {
  display: flex;
  gap: 30px;
  padding: 6px 4px 20px;
}

.sort-btn.sort-confirm {
  color: var(--theme-background, #1a1a1a);
  background: var(--theme-text, #fff);
}

.sort-btn.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.card-title.sort-title {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.5;
}

.head-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  margin-left: auto;
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
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px 8px;

  .head-left {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-width: 0;
  }

  .card-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    flex-shrink: 0;
  }

  .card-source {
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.22);
    color: inherit;
    opacity: 0.82;
    font-size: 12px;
    line-height: 17px;
    white-space: normal;
    word-break: break-word;
  }
}

.mode-pill {
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
  cursor: pointer;

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

  &.is-dragging {
    position: relative;
    z-index: 2;
    background: var(--popup-bg);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    border-radius: 10px;
  }

  .drag-handle {
    flex-shrink: 0;
    padding: 8px 4px;
    color: var(--theme-text, #fff);
    opacity: 0.65;
    cursor: grab;
    touch-action: none;
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
