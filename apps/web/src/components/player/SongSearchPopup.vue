<template>
  <van-popup
    v-model:show="visible"
    position="right"
    :style="{ width: '100%', height: '100%' }"
    class="search-popup"
    @closed="reset"
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

      <div class="search-body" @scroll="closeMenu">
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
            <div class="row-actions">
              <van-loading
                v-if="state.addingId === song.id"
                size="18"
                color="var(--theme-text)"
              />
              <button
                v-else
                type="button"
                class="more-btn"
                title="更多操作"
                @click.stop="toggleMenu($event, song)"
              >
                <!-- 竖向三点图标，跟随主题文字色 -->
                <svg viewBox="0 0 4 16" width="4" height="16" aria-hidden="true">
                  <circle cx="2" cy="2" r="1.6" fill="currentColor" />
                  <circle cx="2" cy="8" r="1.6" fill="currentColor" />
                  <circle cx="2" cy="14" r="1.6" fill="currentColor" />
                </svg>
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </van-popup>

  <!-- 每行的竖向操作菜单：播放 / 加入歌单，teleport 到 body 避免被列表滚动区域裁剪 -->
  <teleport to="body">
    <div v-if="menuVisible" class="row-menu-mask" @click="closeMenu" />
    <div v-if="menuVisible" class="row-menu" :style="menuStyle">
      <button type="button" class="menu-item" @click="onMenuPlay">
        <van-icon name="play-circle-o" size="16" />
        <span>播放</span>
      </button>
      <button type="button" class="menu-item" @click="onMenuAddToPlaylist">
        <van-icon name="plus" size="16" />
        <span>加入歌单</span>
      </button>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import type { Song } from '@/types/music'
import { useSongSearch } from '@/composables/player/useSongSearch'
import { usePlayerStore } from '@/stores/player'
import { useSwipeClose } from '@/composables/useSwipeClose'
import WaveBox from '@/components/waveBox/WaveBox.vue'
import { ref, watch } from 'vue'

const emit = defineEmits<{
  /** 加入歌单：可能是尚未入库的搜索结果，上层确认歌单时再确保注册 */
  (e: 'addToPlaylist', song: Song): void
}>()

const LOGO_URL = '/qs.svg'

/** 竖向操作菜单的宽度（用于靠右对齐定位） */
const MENU_WIDTH = 132
/** 菜单高度估算：两个选项 + 内边距，用于下方空间不足时向上弹出 */
const MENU_HEIGHT = 96

const keyword = defineModel<string>('keyword', { required: true })
const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { state, submitSearch, addSongToQueue, warmUpSong, isSongPlaying, closeSearch } = useSongSearch(keyword, visible)

/** 行操作菜单：当前展开的歌曲与定位 */
const menuVisible = ref(false)
const menuSong = ref<Song | null>(null)
const menuStyle = ref<Record<string, string>>({})

/** 打开/收起某一行的竖向菜单，位置贴着触发按钮，下方空间不足时向上弹 */
function toggleMenu(event: MouseEvent, song: Song) {
  if (menuVisible.value && menuSong.value?.id === song.id) {
    closeMenu()
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8)
  const top = window.innerHeight - rect.bottom < MENU_HEIGHT + 12
    ? rect.top - MENU_HEIGHT - 6
    : rect.bottom + 6
  menuSong.value = song
  menuStyle.value = { top: `${top}px`, left: `${left}px` }
  menuVisible.value = true
}

function closeMenu() {
  menuVisible.value = false
  menuSong.value = null
}

/** 菜单「播放」：和点击整行一致 */
function onMenuPlay() {
  const song = menuSong.value
  closeMenu()
  if (song)
    addSongToQueue(song)
}

/** 菜单「加入歌单」：立即打开歌单选择弹层，真实歌曲在后台注册入库 */
function onMenuAddToPlaylist() {
  const song = menuSong.value
  closeMenu()
  if (!song)
    return
  warmUpSong(song)
  emit('addToPlaylist', song)
}

/** 搜索弹窗关闭时收起菜单，避免菜单残留在页面上 */
watch(visible, (val) => {
  if (!val)
    closeMenu()
})

const { swipeStyle, handlers, reset } = useSwipeClose(closeSearch)
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
  background: var(--popup-bg);
  touch-action: pan-y;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 12px;

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
  padding: 4px 8px 24px;
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

  .row-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    min-width: 30px;
    justify-content: flex-end;
  }

  .more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: transparent;
    opacity: 0.55;
    cursor: pointer;

    &:active {
      opacity: 1;
      background: rgba(128, 128, 128, 0.18);
    }
  }
}

/* 行操作菜单：跟随主题色的竖向列表，浮在搜索弹层之上 */
.row-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: transparent;
}

.row-menu {
  position: fixed;
  z-index: 3001;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 132px;
  padding: 6px;
  box-sizing: border-box;
  border-radius: 12px;
  color: var(--theme-text, #fff);
  background: var(--popup-bg-raised);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    color: inherit;
    font-size: 14px;
    text-align: left;
    background: transparent;
    cursor: pointer;

    &:active {
      background: rgba(128, 128, 128, 0.2);
    }
  }
}
</style>
