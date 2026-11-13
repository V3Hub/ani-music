<template>
  <div class="discover-panel">
    <div class="search-bar" @click="emit('search')">
      <van-icon name="search" size="18" class="search-icon" />
      <span class="search-placeholder">搜索歌曲、歌手、歌单</span>
    </div>

    <div v-if="items.length" class="playlist-grid">
      <div
        v-for="item in items"
        :key="item.id"
        class="grid-cell"
        @click="emit('open', item)"
      >
        <PlaylistCard
          :item="item"
          :is-active="activePlaylist?.source === 'discover' && activePlaylist?.id === item.id"
          :is-playing="isPlaying"
        />
      </div>
    </div>

    <div v-else class="empty-tip">
      暂无推荐歌单
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'
import PlaylistCard from '@/components/playlist/PlaylistCard.vue'

defineProps<{
  items: PlaylistItem[]
  activePlaylist: PlaylistItem | null
  isPlaying: boolean
}>()

const emit = defineEmits<{
  (e: 'open', item: PlaylistItem): void
  (e: 'search'): void
}>()
</script>

<style lang="scss" scoped>
.discover-panel {
  flex: 1;
  min-height: 0;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  color: var(--theme-text, #fff);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  margin-bottom: 16px;
  border-radius: 20px;
  background: rgba(128, 128, 128, 0.16);
  cursor: pointer;

  .search-icon {
    flex-shrink: 0;
    opacity: 0.55;
  }

  .search-placeholder {
    overflow: hidden;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0.5;
  }
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.grid-cell {
  min-width: 0;
  cursor: pointer;
}

.empty-tip {
  padding-top: 80px;
  font-size: 14px;
  text-align: center;
  opacity: 0.5;
}
</style>
