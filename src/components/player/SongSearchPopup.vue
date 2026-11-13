<template>
  <van-popup
    v-model:show="visible"
    position="right"
    :style="{ width: '100%', height: '100%' }"
    class="search-popup"
  >
    <div class="search-wrap" :style="swipeStyle" v-on="handlers">
      <div class="search-header">
        <div class="search-input-wrap">
          <van-icon name="search" size="16" class="search-icon" />
          <form action="#" @submit.prevent="submitSearch">
            <input
              v-model="keyword"
              type="search"
              class="search-input"
              placeholder="搜索歌曲、歌手"
              maxlength="20"
              enterkeyhint="search"
              autofocus
            >
          </form>
          <van-icon
            v-if="keyword"
            name="clear"
            size="16"
            class="clear-icon"
            @click="keyword = ''"
          />
        </div>
        <span class="cancel-btn" @click="closeSearch">取消</span>
      </div>

      <div class="search-body">
        <template v-if="!state.searched && !keyword.trim()">
          <div class="empty-tip guide-tip">
            <van-icon name="music-o" size="40" class="guide-icon" />
            <div class="guide-text">输入关键词开始搜索</div>
          </div>
        </template>
        <van-loading v-else-if="state.loading" size="24px" vertical color="var(--theme-text)" class="center-loader">
          加载中...
        </van-loading>
        <div v-else-if="!state.resultList.length" class="empty-tip">
          <van-icon name="search" size="36" class="guide-icon" />
          <div>没有相关歌曲</div>
        </div>
        <ul v-else class="song-list">
          <li
            v-for="song in state.resultList"
            :key="song.id"
            class="song-row"
            :class="{ 'is-current': isSongPlaying(song) }"
            @click="addSongToQueue(song)"
          >
            <div class="row-cover">
              <div
                v-if="isSongPlaying(song)"
                class="wave-overlay"
              >
                <WaveBox :playing="player.isPlaying" />
              </div>
              <van-image width="52" height="52" fit="cover" :src="song.pic ?? LOGO_URL">
                <template #error>
                  <img class="cover-fallback" :src="LOGO_URL" alt="">
                </template>
              </van-image>
            </div>
            <div class="row-main">
              <div class="row-title">{{ song.title }}</div>
              <div class="row-sub">
                {{ song.singer }}
                <template v-if="song.album"> · {{ song.album }}</template>
              </div>
            </div>
            <van-loading
              v-if="state.addingId === song.id"
              size="18"
              color="var(--theme-text)"
              class="row-play"
            />
            <van-icon v-else name="play-circle-o" size="22" class="row-play" />
          </li>
        </ul>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { useSongSearch } from '@/composables/player/useSongSearch'
import { usePlayerStore } from '@/stores/player'
import { useSwipeClose } from '@/composables/useSwipeClose'
import WaveBox from '@/components/waveBox/WaveBox.vue'

const LOGO_URL = '/qs.svg'

const keyword = defineModel<string>('keyword', { required: true })
const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { state, submitSearch, addSongToQueue, isSongPlaying, closeSearch } = useSongSearch(keyword, visible)

const { swipeStyle, handlers } = useSwipeClose(closeSearch)
</script>

<style lang="scss" scoped>
.search-popup {
  background: transparent !important;
}

.search-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--theme-text, #fff);
  background: var(--theme-background, #1a1a1a);
  touch-action: pan-y;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px;

  .search-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 36px;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.14);

    .search-icon {
      flex-shrink: 0;
      opacity: 0.6;
    }

    form {
      flex: 1;
      display: flex;
    }

    .search-input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--theme-text, #fff);
      font-size: 14px;

      &::placeholder {
        opacity: 0.45;
      }

      &::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
      }
    }

    .clear-icon {
      flex-shrink: 0;
      opacity: 0.55;
      cursor: pointer;
    }
  }

  .cancel-btn {
    flex-shrink: 0;
    font-size: 14px;
    opacity: 0.75;
    cursor: pointer;
  }
}

.search-body {
  flex: 1;
  overflow-y: auto;
}

.center-loader {
  display: flex;
  justify-content: center;
  padding-top: 80px;
}

.empty-tip {
  text-align: center;
  padding: 60px 20px;
  font-size: 14px;
  opacity: 0.4;

  .guide-icon {
    margin-bottom: 12px;
    opacity: 0.35;
  }
}

.guide-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 120px;
  opacity: 0.5;

  .guide-text {
    margin-top: 4px;
    font-size: 14px;
  }
}

.song-list {
  list-style: none;
  margin: 0;
  padding: 4px 8px calc(24px + env(safe-area-inset-bottom));
}

.song-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s;

  &:active {
    background: rgba(128, 128, 128, 0.12);
  }

  &.is-current .row-title {
    color: #35c46a;
  }

  .row-cover {
    position: relative;
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(128, 128, 128, 0.18);

    .wave-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2;
    }

    img,
    .van-image {
      border-radius: 8px;
    }
  }

  .cover-fallback {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
    background: rgba(128, 128, 128, 0.14);
    box-sizing: border-box;
  }

  .row-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .row-title {
    overflow: hidden;
    font-size: 15px;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--theme-text, #fff);
  }

  .row-sub {
    overflow: hidden;
    font-size: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0.5;
  }

  .row-play {
    flex-shrink: 0;
    opacity: 0.5;
  }
}
</style>
