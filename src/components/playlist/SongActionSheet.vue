<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="song-action-popup"
    @update:show="emit('update:visible', $event)"
  >
    <div class="song-action-sheet">
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
          <van-icon name="music-o" size="22" class="action-icon" />
          <span>添加到歌单</span>
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
  (e: 'delete'): void
}>()

const LOGO_URL = '/qs.svg'
</script>

<style lang="scss" scoped>
.song-action-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.song-action-sheet {
  padding: 12px 20px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
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
