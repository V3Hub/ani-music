<template>
  <div class="playlist-card" :style="{ backgroundImage: `url(${item.pic ?? ''})` }">
    <div class="mask" />
    <div v-if="isActive" class="wave-overlay">
      <WaveBox :playing="isPlaying" />
    </div>
    <div class="card-meta">
      <div class="card-name">
        {{ item.name }}
      </div>
      <div v-if="item.desc" class="card-desc">
        {{ item.desc }}
      </div>
      <div class="card-stats">
        <span>{{ item.count ?? 0 }}首</span>
        <template v-if="item.subscribe_count != null">
          <span class="dot">·</span>
          <span>{{ formatCount(item.subscribe_count) }}人收藏</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'
import WaveBox from '@/components/waveBox/WaveBox.vue'

defineProps<{
  item: PlaylistItem
  isActive: boolean
  isPlaying: boolean
}>()

/** 收藏人次超过一万时显示为 x.x万 */
function formatCount(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value)
}
</script>

<style lang="scss" scoped>
.playlist-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  width: 100%;
  aspect-ratio: 4 / 3;
  padding: 12px;
  overflow: hidden;
  border-radius: 12px;
  color: #fff;
  background-color: rgba(128, 128, 128, 0.2);
  background-position: center;
  background-size: cover;

  .mask {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.62) 100%);
  }

  .wave-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    transform: translate(-50%, -50%);
  }

  .card-meta {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .card-name {
      display: -webkit-box;
      overflow: hidden;
      font-size: 15px;
      font-weight: 600;
      line-height: 20px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .card-desc {
      overflow: hidden;
      font-size: 12px;
      white-space: nowrap;
      text-overflow: ellipsis;
      opacity: 0.72;
    }

    .card-stats {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      opacity: 0.66;

      .dot {
        opacity: 0.7;
      }
    }
  }
}
</style>
