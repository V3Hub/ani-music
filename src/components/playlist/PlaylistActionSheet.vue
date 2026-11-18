<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="playlist-action-popup"
    @update:show="emit('update:visible', $event)"
    @closed="resetDrag"
  >
    <div class="playlist-action-sheet" :style="dragStyle" v-on="dragHandlers">
      <div class="sheet-handle" />

      <div v-if="playlist" class="sheet-head">
        <div class="head-cover">
          <van-image width="100%" height="100%" radius="8" fit="cover" :src="playlist.pic || LOGO_URL">
            <template #error>
              <img class="cover-fallback" :src="LOGO_URL" alt="">
            </template>
          </van-image>
        </div>
        <div class="head-meta">
          <div class="head-name">
            {{ playlist.name }}
          </div>
          <div class="head-owner">
            @{{ ownerName }} · {{ shareCount ?? 0 }} 人分享
          </div>
        </div>
      </div>

      <div class="action-list">
        <button v-if="isOwner" type="button" class="action-item" @click="emit('delete')">
          <van-icon name="delete-o" size="22" class="action-icon" />
          <span>删除歌单</span>
        </button>
        <button v-else-if="collected" type="button" class="action-item" @click="emit('unsubscribe')">
          <van-icon name="star" size="22" class="action-icon" />
          <span>取消收藏</span>
        </button>
        <button v-else type="button" class="action-item" @click="emit('favorite')">
          <van-icon name="star-o" size="22" class="action-icon" />
          <span>收藏歌单</span>
        </button>
        <button type="button" class="action-item" @click="emit('share')">
          <van-icon name="share-o" size="22" class="action-icon" />
          <span>分享歌单</span>
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'
import { computed, ref } from 'vue'

const props = defineProps<{
  visible: boolean
  playlist: PlaylistItem | null
  isOwner: boolean
  /** 是否是自己的收藏列表里的歌单（非本人创建） */
  collected?: boolean
  /** 歌单分享人数 */
  shareCount?: number
}>()

/** 作者展示名：真实昵称优先，其次 userToken，最后 guest */
const ownerName = computed(() => props.playlist?.nickname || props.playlist?.userToken || 'guest')

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'favorite'): void
  (e: 'unsubscribe'): void
  (e: 'delete'): void
  (e: 'share'): void
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
.playlist-action-popup {
  // 背景交给内容层：下拉拖动时背景跟内容一起移动
  background: transparent !important;
}

.playlist-action-sheet {
  padding: 8px 20px calc(20px + env(safe-area-inset-bottom));
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

.sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 18px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);

  .head-cover {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    overflow: hidden;
    border-radius: 8px;
  }

  .cover-fallback {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 10px;
    object-fit: contain;
    background: rgba(128, 128, 128, 0.16);
  }

  .head-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .head-name {
    overflow: hidden;
    font-size: 16px;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .head-owner {
    font-size: 12px;
    opacity: 0.55;
  }
}

.action-list {
  display: flex;
  flex-direction: column;
  padding-top: 6px;
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
