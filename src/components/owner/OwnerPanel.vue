<template>
  <div class="owner-panel">
    <div class="owner-header">
      <div>10小时48分钟</div>
      <van-icon class="settings-btn" name="setting-o" size="22" @click="emit('openSettings')" />
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
        <div class="create-btn" @click="emit('createPlaylist')">
          <van-icon name="plus" />
          创建
        </div>
      </div>
      <ul class="playlist-list">
        <li @click="emit('openFavorite')">
          <div class="cover-wrap">
            <div v-if="activePlaylist?.source === 'favorite' && isPlaying" class="wave-overlay">
              <div class="wave-box"><span /><span /><span /></div>
            </div>
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(favoriteSongs[0]?.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
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
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(playHistory[0]?.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
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
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(item.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
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

/** 项目 logo，歌单没有封面时兜底 */
const LOGO_URL = '/qs.svg'

function coverOf(pic?: string) {
  return pic || LOGO_URL
}
</script>

<style lang="scss" scoped>
.owner-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 20px;
  // 文字颜色跟随封面主题色计算出的前景色，自动适配深/浅背景
  color: var(--theme-text, #fff);

  .owner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px;

    .settings-btn {
      color: var(--theme-text, #fff);
      cursor: pointer;
      opacity: 0.9;
    }
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

    .user-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;

      > div:first-child {
        font-size: 16px;
        font-weight: 500;
      }

      > div:last-child {
        font-size: 12px;
        opacity: 0.55;
      }
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    opacity: 0.85;

    .create-btn {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 13px;
      cursor: pointer;
    }
  }

  .cover-fallback {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    object-fit: contain;
    background: rgba(128, 128, 128, 0.16);
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
        flex-shrink: 0;

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
        gap: 6px;

        > div:first-child {
          font-size: 15px;
        }

        > div:last-child {
          font-size: 12px;
          opacity: 0.55;
        }
      }
    }
  }
}
</style>
