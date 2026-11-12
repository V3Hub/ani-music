<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="playlist-action-popup"
    @update:show="emit('update:visible', $event)"
  >
    <div class="playlist-action-sheet">
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
            @{{ playlist.userToken ?? 'guest' }}
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
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'

defineProps<{
  visible: boolean
  playlist: PlaylistItem | null
  isOwner: boolean
  /** 是否是自己的收藏列表里的歌单（非本人创建） */
  collected?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'favorite'): void
  (e: 'unsubscribe'): void
  (e: 'delete'): void
}>()

const LOGO_URL = '/qs.svg'
</script>

<style lang="scss" scoped>
.playlist-action-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.playlist-action-sheet {
  padding: 8px 20px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
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
