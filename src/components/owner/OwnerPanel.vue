<template>
  <div class="owner-panel">
    <div class="owner-header">
      <div>10小时48分钟</div>
      <van-button plain size="mini" @click="emit('openSettings')">
        <van-icon name="setting-o" />
      </van-button>
    </div>
    <div class="owner-content">
      <div class="user-info">
        <van-image
          round
          width="48"
          height="48"
          :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${userToken}`"
        />
        <div class="user-meta">
          <div>{{ userToken || '游客' }}</div>
          <div>100关注 100粉丝</div>
        </div>
      </div>
      <div class="section-title">
        创建的歌单
        <van-button size="mini" plain @click="emit('createPlaylist')">
          <van-icon name="add-o" />
          创建
        </van-button>
      </div>
      <ul class="playlist-list">
        <li @click="emit('openFavorite')">
          <div class="cover-wrap">
            <div v-if="activePlaylist?.source === 'favorite' && isPlaying" class="wave-overlay">
              <div class="wave-box"><span /><span /><span /></div>
            </div>
            <van-image width="64" height="64" round :src="favoriteSongs[0]?.pic ?? ''" />
          </div>
          <div class="item-meta">
            <div>我喜欢的</div>
            <div>{{ favoriteSongs.length }}首</div>
          </div>
        </li>
        <li @click="emit('openHistory')">
          <div class="cover-wrap">
            <div v-if="activePlaylist?.source === 'playRecord' && isPlaying" class="wave-overlay">
              <div class="wave-box"><span /><span /><span /></div>
            </div>
            <van-image width="64" height="64" round :src="playHistory[0]?.pic ?? ''" />
          </div>
          <div class="item-meta">
            <div>历史播放</div>
            <div>{{ playHistory.length }}首</div>
          </div>
        </li>
        <li
          v-for="item in playlists"
          :key="item.id"
          @click="emit('openPlaylist', item.id)"
        >
          <div class="cover-wrap">
            <div
              v-if="activePlaylist?.source === 'playlist' && activePlaylist?.id === item.id && isPlaying"
              class="wave-overlay"
            >
              <div class="wave-box"><span /><span /><span /></div>
            </div>
            <van-image width="64" height="64" round :src="item.pic ?? ''" />
          </div>
          <div class="item-meta">
            <div>{{ item.name }}</div>
            <div>{{ item.count }}首</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem, Song } from '@/types/music'

defineProps<{
  userToken: string
  playlists: PlaylistItem[]
  playHistory: Song[]
  favoriteSongs: Song[]
  activePlaylist: PlaylistItem | null
  isPlaying: boolean
}>()

const emit = defineEmits<{
  (e: 'openFavorite'): void
  (e: 'openHistory'): void
  (e: 'openPlaylist', id: number): void
  (e: 'createPlaylist'): void
  (e: 'openSettings'): void
}>()
</script>

<style lang="scss" scoped>
.owner-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 20px;

  .owner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px;
  }

  .owner-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 5px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;

    .user-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;

      .cover-wrap {
        position: relative;

        .wave-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
        }
      }

      .item-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 14px;
      }
    }
  }
}
</style>
