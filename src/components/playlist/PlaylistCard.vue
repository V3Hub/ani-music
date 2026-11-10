<template>
  <div class="playlist-card" :style="{ backgroundImage: `url(${item.pic ?? ''})` }">
    <div v-if="isActive && isPlaying" class="wave-overlay">
      <div class="wave-box"><span /><span /><span /></div>
    </div>
    <div class="subscriber-count">{{ item.subscribe_count ?? 0 }}</div>
    <div class="card-meta">
      <div class="card-name">
        {{ item.name }}
        <span>({{ item.count ?? 0 }})</span>
      </div>
      <div class="card-desc">{{ item.desc ?? '' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'

defineProps<{
  item: PlaylistItem
  isActive: boolean
  isPlaying: boolean
}>()
</script>

<style lang="scss" scoped>
.playlist-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 120px;
  padding: 5px 10px;
  border-radius: 18px;
  color: #fff;
  background-size: cover;

  .wave-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
  }

  .subscriber-count {
    text-align: right;
    font-size: 18px;
  }

  .card-meta {
    .card-name {
      font-size: 16px;
      line-height: 22px;
    }

    .card-desc {
      font-size: 12px;
    }
  }
}
</style>
