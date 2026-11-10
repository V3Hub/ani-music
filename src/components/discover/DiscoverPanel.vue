<template>
  <div class="discover-panel">
    <van-grid :column-num="2" :gutter="12">
      <van-grid-item
        v-for="item in items"
        :key="item.id"
        @click="emit('open', item)"
      >
        <PlaylistCard
          :item="item"
          :is-active="activePlaylist?.source === 'discover' && activePlaylist?.id === item.id"
          :is-playing="isPlaying"
        />
      </van-grid-item>
    </van-grid>
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

const emit = defineEmits<{ (e: 'open', item: PlaylistItem): void }>()
</script>

<style lang="scss" scoped>
.discover-panel {
  height: 100%;
  padding: 20px 10px;
  overflow-y: auto;
}
</style>
