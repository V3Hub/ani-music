<template>
  <div class="player-layout">
    <!-- 背景层：PlayerStage 独立一层，absolute 铺满整个屏幕含安全区 -->
    <ListeningModeSidebar
      v-model:current-mode="currentMode"
      :collapsed="isCollapsed"
      :mode-list="modeList"
      :scene-list="sceneList"
    />
    <div class="player-stage-container" :class="{ 'is-collapsed': isCollapsed }">
      <PlayerStage
        v-show="currentTab === 'music'"
        class="player-stage-absolute"
        :favorite-songs="favoriteSongs"
        @favorite="onFavorite"
        @open-queue="queueVisible = true"
      />
      <!-- 前景层：工具栏 + 底栏，z-index 高于 PlayerStage -->
      <div v-show="currentTab === 'music'" class="player-main">
        <div class="main-content">
          <PlayerToolbar
            :mode-name="currentModeName"
            @toggle-sidebar="toggleSidebar"
            @open-search="searchVisible = true"
          />
        </div>
      </div>

      <OwnerPanel
        v-if="currentTab === 'owner'"
        :user-token="userToken"
        :playlists="playlists"
        :play-history="playHistory"
        :favorite-songs="favoriteSongs"
        :active-playlist="activePlaylist"
        :is-playing="player.isPlaying"
        @open-favorite="onOpenFavorite"
        @open-history="onOpenHistory"
        @open-playlist="onOpenPlaylist"
        @create-playlist="createPlaylist"
        @open-settings="openSettings"
      />

      <DiscoverPanel
        v-if="currentTab === 'discover'"
        :items="discoverPlaylists"
        :active-playlist="activePlaylist"
        :is-playing="player.isPlaying"
        @open="onOpenDiscover"
      />
      <div class="bottom-bar">
        <PlayerBottomNav
          :nav-items="navList"
          :current-tab="currentTab"
          :is-playing="player.isPlaying"
          :can-play="!!player.currentSong?.id && player.canplay"
          @navigate="onNavigate"
          @toggle-playback="togglePlayback"
        />
      </div>
    </div>
    <SongSearchPopup
      v-model:keyword="keyword"
      v-model:visible="searchVisible"
    />

    <PlaybackQueuePopup
      v-model:visible="queueVisible"
      :playlist-options="playlistOptions"
      :play-mode="playMode"
      @toggle-play-mode="togglePlayMode"
      @share="shareCurrentSong"
      @remove-song="removeSong"
      @add-to-playlist="selectTargetPlaylist"
    />

    <SongListDrawer
      ref="drawerRef"
      :playlists="playlists"
      :active-playlist="activePlaylist"
      :active-songs="activeSongs"
      :favorite-songs="favoriteSongs"
      @delete="removeSongFromActive"
      @add-to-playlist="addSongToPlaylist"
      @delete-playlist="deletePlaylist"
      @add-sub-playlist="savePlaylist"
      @favorite="onFavorite"
    />

    <PlayerSettingsPopup
      v-model:visible="settingsVisible"
      v-model:picker-visible="pickerVisible"
      :source-label="currentSourceLabel"
      :picker-columns="pickerColumns"
      @confirm-source="confirmSource"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem, Song } from '@/types/music'
import { addSongToFavorite, fetchSongs, getFavoriteList, removeSongFromFavorite } from '@/api/music'
import { showToast } from 'vant'
import { useListeningMode } from '@/composables/player/useListeningMode'
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { usePlaylistDiscovery } from '@/composables/player/usePlaylistDiscovery'
import { usePlaylistLibrary } from '@/composables/player/usePlaylistLibrary'
import { usePlayQueue } from '@/composables/player/usePlayQueue'
import { usePlayerNavigation } from '@/composables/player/usePlayerNavigation'
import { usePlaybackSource } from '@/composables/player/usePlaybackSource'
import { usePlayerStore } from '@/stores/player'
import { computed, onMounted, ref } from 'vue'
import DiscoverPanel from '@/components/discover/DiscoverPanel.vue'
import ListeningModeSidebar from '@/components/player/ListeningModeSidebar.vue'
import PlaybackQueuePopup from '@/components/player/PlaybackQueuePopup.vue'
import PlayerBottomNav from '@/components/player/PlayerBottomNav.vue'
import PlayerSettingsPopup from '@/components/player/PlayerSettingsPopup.vue'
import PlayerStage from '@/components/player/PlayerStage.vue'
import PlayerToolbar from '@/components/player/PlayerToolbar.vue'
import SongSearchPopup from '@/components/player/SongSearchPopup.vue'
import SongListDrawer from '@/components/playlist/SongListDrawer.vue'
import OwnerPanel from '@/components/owner/OwnerPanel.vue'

const player = usePlayerStore()

const drawerRef = ref<InstanceType<typeof SongListDrawer>>()
const searchVisible = ref(false)
const queueVisible = ref(false)

const keyword = ref('')

const favoriteSongs = ref<Song[]>([])

// ========== 组合业务模块 ==========
const { currentTab, navList, navigate } = usePlayerNavigation()
const { isCollapsed, currentMode, modeList, sceneList, currentModeName, toggleSidebar } = useListeningMode()
const {
  settingsVisible,
  pickerVisible,
  currentSourceLabel,
  pickerColumns,
  openSettings,
  confirmSource,
} = usePlaybackSource()
const { togglePlayback } = usePlaybackControl()

const {
  userToken,
  playlists,
  playHistory,
  activePlaylist,
  activeSongs,
  openContext,
  fetchUserPlaylists,
  fetchPlayHistory,
  openFavoritePlaylist: openFavoriteContext,
  openPlayHistory: openHistoryContext,
  openUserPlaylist,
  removeSongFromActive,
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  savePlaylist,
} = usePlaylistLibrary({ favoriteSongs })

const { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext } = usePlaylistDiscovery()

const {
  playlistOptions,
  playMode,
  togglePlayMode,
  removeSong,
  selectTargetPlaylist,
  shareCurrentSong,
} = usePlayQueue({
  playlists: computed(() => playlists.value),
  activePlaylistId: computed(() => activePlaylist.value?.id),
})

// ========== 导航与数据加载 ==========
function onNavigate(tab: string) {
  navigate(tab)
  if (tab === 'owner') {
    fetchUserPlaylists()
    fetchPlayHistory()
  } else if (tab === 'discover') {
    fetchDiscoverPlaylists()
  }
}

// ========== 歌单抽屉打开 ==========
function onOpenFavorite() {
  openFavoriteContext()
  drawerRef.value?.open()
}

function onOpenHistory() {
  openHistoryContext()
  drawerRef.value?.open()
}

async function onOpenPlaylist(id: number) {
  await openUserPlaylist(id)
  drawerRef.value?.open()
}

async function onOpenDiscover(item: PlaylistItem) {
  openContext(await buildDiscoverContext(item))
  drawerRef.value?.open()
}

/** 判断歌曲是否已收藏：优先用播放时获取的状态，其次查本地收藏列表 */
function isFavoriteSong(song: Song): boolean {
  if (typeof song.favorite === 'boolean')
    return song.favorite
  return favoriteSongs.value.some(item => item.id === song.id)
}

/** 收藏 / 取消收藏当前歌曲，并同步本地收藏列表 */
async function onFavorite(id?: string | number) {
  const song = player.currentSong
  if (!song || (id != null && song.id !== id))
    return

  const next = !isFavoriteSong(song)
  const ok = next ? await addSongToFavorite(song.id) : await removeSongFromFavorite(song.id)
  if (!ok) {
    showToast(next ? '收藏失败' : '取消收藏失败')
    return
  }

  song.favorite = next
  // 收藏数默认按 0 处理，收藏 / 取消时本地 ±1
  song.favoriteCount = Math.max(0, (song.favoriteCount ?? 0) + (next ? 1 : -1))
  favoriteSongs.value = next
    ? [song, ...favoriteSongs.value.filter(item => item.id !== song.id)]
    : favoriteSongs.value.filter(item => item.id !== song.id)
  showToast(next ? '已收藏' : '已取消收藏')
}

onMounted(async () => {
  if (player.playList.length === 0) {
    const songs = await fetchSongs()
    player.setPlayList(songs, 0)
  }
  getFavoriteList().then((songs) => {
    favoriteSongs.value = songs
  }).catch(() => {})
  fetchUserPlaylists()
  fetchDiscoverPlaylists()
})
</script>

<style lang="scss" scoped>
.player-layout {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;

  .player-stage-container {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  // 背景层：PlayerStage absolute 铺满 + 延伸进安全区
  .player-stage-absolute {
    position: absolute;
    inset: 0;
    z-index: 100;
  }

  // 前景层：工具栏 / 底栏 / panel 浮在 PlayerStage 之上
  .player-main {
    position: relative;
    z-index: 200;
    display: flex;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    padding-top: var(--safe-top, 0px);
    box-sizing: border-box;
    pointer-events: none;
  }

  // 占位：让 PlayerToolbar 和 bottom-bar 保持 flex 布局，中间留给 PlayerStage 的 Swiper
  .swiper-spacer {
    flex: 1;
    min-height: 0;
    // 不设背景，让底层 PlayerStage 的深色透出来
    pointer-events: none;
  }

  // 交互元素恢复 pointer-events
  .player-main :deep(.player-toolbar),
  .player-main :deep(.bottom-bar),
  .player-main :deep(.van-tabbar),
  .player-main :deep(.player-bottom-nav) {
    pointer-events: auto;
  }

  .bottom-bar {
    flex-shrink: 0;
    position: relative;
    z-index: 200;
    padding-bottom: var(--safe-bottom, 0px);
    pointer-events: auto;
  }
}
</style>
