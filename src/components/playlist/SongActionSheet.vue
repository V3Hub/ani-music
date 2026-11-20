<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="song-action-popup"
    @update:show="emit('update:visible', $event)"
    @closed="resetDrag"
  >
    <div class="song-action-sheet" :style="dragStyle" v-on="dragHandlers">
      <div class="sheet-handle" />

      <div v-if="song" class="song-head">
        <van-image width="56" height="56" radius="8" fit="cover" :src="song.pic || LOGO_URL">
          <template #error>
            <img class="cover-fallback" :src="LOGO_URL" alt="">
          </template>
        </van-image>
        <div class="song-meta">
          <div class="song-title">
            {{ song.title }}
          </div>
          <div class="song-sub">
            {{ song.singer }}<template v-if="song.album"> · {{ song.album }}</template>
          </div>
        </div>
      </div>

      <div class="action-list">
        <button type="button" class="action-item" @click="emit('favorite')">
          <van-icon :name="isFavorite ? 'like' : 'like-o'" size="22" class="action-icon" />
          <span>{{ isFavorite ? '取消喜欢' : '喜欢' }}</span>
        </button>
        <button type="button" class="action-item" @click="emit('addToPlaylist')">
          <svg
            class="action-icon"
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
          <span>添加到歌单</span>
        </button>
        <button type="button" class="action-item" @click="emit('share')">
          <van-icon name="share-o" size="22" class="action-icon" />
          <span>分享歌曲</span>
        </button>
        <button type="button" class="action-item" @click="emit('download')">
          <svg
            class="action-icon"
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
          <span>下载歌曲</span>
        </button>
        <button v-if="canDelete" type="button" class="action-item" @click="emit('delete')">
          <van-icon name="delete-o" size="22" class="action-icon" />
          <span>删除</span>
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Song } from '@/types/music'
import { computed, ref } from 'vue'

defineProps<{
  visible: boolean
  song: Song | null
  isFavorite: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'favorite'): void
  (e: 'addToPlaylist'): void
  (e: 'share'): void
  (e: 'download'): void
  (e: 'delete'): void
}>()

const LOGO_URL = '/qs.svg'

// ========== 下拉关闭 ==========
const CLOSE_DISTANCE = 80
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
  dragY.value = 0
  dragging.value = true
}

function onDragMove(event: TouchEvent) {
  if (!dragging.value)
    return
  const touch = event.touches[0]
  if (!touch)
    return
  const dy = touch.clientY - startY
  dragY.value = Math.max(0, dy)
  if (dy > 0 && event.cancelable)
    event.preventDefault()
}

function onDragEnd() {
  if (!dragging.value)
    return
  if (dragY.value >= CLOSE_DISTANCE) {
    // 保持拖出位置直接关闭，避免先回弹再关闭的抖动
    emit('update:visible', false)
    return
  }
  dragging.value = false
  dragY.value = 0
}

function onDragCancel() {
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
  touchcancel: onDragCancel,
}
</script>

<style lang="scss" scoped>
.song-action-popup {
  // 背景交给内容层：下拉拖动时背景跟内容一起移动
  background: transparent !important;
}

.song-action-sheet {
  padding: 12px 20px 20px;
  color: var(--theme-text, #fff);
  background: var(--popup-bg-raised);
  border-radius: inherit;
  touch-action: none;
  will-change: transform;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.45);
}

.song-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0 20px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);

  .cover-fallback {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 14px;
    object-fit: contain;
    background: rgba(128, 128, 128, 0.16);
  }

  .song-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .song-title {
    overflow: hidden;
    font-size: 16px;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .song-sub {
    overflow: hidden;
    font-size: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0.55;
  }
}

.action-list {
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 2px;
  border: none;
  font-size: 15px;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;

  .action-icon {
    flex-shrink: 0;
    opacity: 0.85;
  }
}
</style>
