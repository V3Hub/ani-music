<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="add-to-playlist-popup"
    @update:show="emit('update:visible', $event)"
  >
    <div class="add-to-playlist">
      <div class="sheet-title">
        添加到歌单
      </div>

      <div class="target-list">
        <button type="button" class="target-item" @click="emit('create')">
          <div class="tile tile-icon">
            <van-icon name="plus" size="22" />
          </div>
          <span class="target-name">创建歌单</span>
        </button>

        <button type="button" class="target-item" @click="emit('select', 'favorite')">
          <div class="tile" :class="{ 'tile-cover': favoriteCover }">
            <van-image v-if="favoriteCover" width="100%" height="100%" fit="cover" :src="favoriteCover">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
            <van-icon v-else name="like" size="20" />
          </div>
          <div class="target-meta">
            <span class="target-name">我喜欢的</span>
            <span class="target-count">{{ favoriteCount }}首</span>
          </div>
        </button>

        <button
          v-for="item in playlists"
          :key="item.id"
          type="button"
          class="target-item"
          @click="emit('select', item.id)"
        >
          <div class="tile tile-cover">
            <van-image width="100%" height="100%" fit="cover" :src="item.pic || LOGO_URL">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
          <div class="target-meta">
            <span class="target-name">{{ item.name }}</span>
            <span v-if="item.count != null" class="target-count">{{ item.count }}首</span>
          </div>
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'

defineProps<{
  visible: boolean
  playlists: PlaylistItem[]
  favoriteCount: number
  /** 我喜欢的歌单封面（取第一首歌的封面），为空时显示心形图标 */
  favoriteCover?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select', target: number | 'favorite'): void
  (e: 'create'): void
}>()

const LOGO_URL = '/qs.svg'
</script>

<style lang="scss" scoped>
.add-to-playlist-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.add-to-playlist {
  padding: 4px 20px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
}

.sheet-title {
  padding: 16px 0;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}

.target-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 55vh;
  overflow-y: auto;
}

.target-item {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  padding: 0;
  border: none;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.tile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.2);
}

.tile-cover {
  background: none;
}

.cover-fallback {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  object-fit: contain;
  background: rgba(128, 128, 128, 0.16);
}

.target-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .target-name {
    overflow: hidden;
    font-size: 15px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .target-count {
    font-size: 12px;
    opacity: 0.55;
  }
}
</style>
