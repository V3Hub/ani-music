<template>
  <div class="player-layout" v-on="swipeHandlers">
    <!-- 背景层：PlayerStage 独立一层，absolute 铺满整个屏幕含安全区 -->
    <ListeningModeSidebar
      :current-mode="currentMode"
      :width="sidebarWidth"
      :dragging="dragging"
      :playing="player.isPlaying && player.canplay"
      :mode-list="modeList"
      :scene-list="sceneList"
      @update:current-mode="onSelectMode"
      @close="toggleSidebar"
    />
    <div class="player-stage-container">
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
        @create-playlist="createVisible = true"
        @open-settings="openSettings"
      />

      <DiscoverPanel
        v-if="currentTab === 'discover'"
        :items="discoverPlaylists"
        :active-playlist="activePlaylist"
        :is-playing="player.isPlaying"
        @open="onOpenDiscover"
        @search="searchVisible = true"
      />

      <WelfarePanel v-if="currentTab === 'benefit'" />

      <div class="bottom-bar">
        <PlayerBottomNav
          :nav-items="navList"
          :current-tab="currentTab"
          :is-playing="player.isPlaying"
          :can-play="!!player.currentSong?.id && player.canplay"
          :cover="player.currentSong?.pic ?? ''"
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
      :play-mode="playMode"
      @toggle-play-mode="togglePlayMode"
      @share="shareCurrentSong"
      @remove-song="removeSong"
      @open-add-to-playlist="openAddToPlaylistFromQueue"
    />

    <SongListDrawer
      ref="drawerRef"
      :active-playlist="activePlaylist"
      :active-songs="activeSongs"
      :is-owner="activePlaylistIsOwner"
      @more="onOpenSongActions"
      @delete-playlist="deletePlaylist"
      @add-sub-playlist="savePlaylist"
      @remove-sub-playlist="removeSavedPlaylist"
    />

    <PlayerSettingsPopup
      v-model:visible="settingsVisible"
      v-model:picker-visible="pickerVisible"
      v-model:sleep-visible="sleepVisible"
      :source-label="currentSourceLabel"
      :source-options="sourceOptions"
      :current-source="source"
      :sleep-label="sleepLabel"
      :sleep-minutes="sleepMinutes"
      @confirm-source="confirmSource"
      @set-sleep-timer="setSleepTimer"
    />

    <CreatePlaylistPopup v-model:visible="createVisible" :submitting="creatingPlaylist" @submit="onCreatePlaylist" />

    <SongActionSheet
      v-model:visible="songActionVisible"
      :song="actionSong"
      :is-favorite="actionSong ? isFavoriteSong(actionSong) : false"
      :can-delete="canDeleteActionSong"
      @favorite="onActionFavorite"
      @add-to-playlist="addToPlaylistVisible = true"
      @delete="onActionDelete"
    />

    <AddToPlaylistSheet
      v-model:visible="addToPlaylistVisible"
      :playlists="playlists"
      :favorite-count="favoriteSongs.length"
      :favorite-cover="favoriteSongs[0]?.pic"
      @select="onSelectPlaylistTarget"
      @create="onCreatePlaylistFromSheet"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem, Song } from '@/types/music'
import { addSongToFavorite, fetchSongs, getFavoriteList, getRecommendList, removeSongFromFavorite } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { showToast } from 'vant'
import { useListeningMode } from '@/composables/player/useListeningMode'
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { usePlaylistDiscovery, toUserToken } from '@/composables/player/usePlaylistDiscovery'
import { usePlaylistLibrary } from '@/composables/player/usePlaylistLibrary'
import { usePlayQueue } from '@/composables/player/usePlayQueue'
import { usePlayerNavigation } from '@/composables/player/usePlayerNavigation'
import { usePlaybackSource } from '@/composables/player/usePlaybackSource'
import { usePlayerStore } from '@/stores/player'
import { play } from '@/services/audio-player'
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
import CreatePlaylistPopup from '@/components/playlist/CreatePlaylistPopup.vue'
import SongActionSheet from '@/components/playlist/SongActionSheet.vue'
import AddToPlaylistSheet from '@/components/playlist/AddToPlaylistSheet.vue'
import OwnerPanel from '@/components/owner/OwnerPanel.vue'
import WelfarePanel from '@/components/welfare/WelfarePanel.vue'

const player = usePlayerStore()

const drawerRef = ref<InstanceType<typeof SongListDrawer>>()
const searchVisible = ref(false)
const queueVisible = ref(false)
const createVisible = ref(false)
const creatingPlaylist = ref(false)
const songActionVisible = ref(false)
const addToPlaylistVisible = ref(false)
const actionSong = ref<Song | null>(null)

const keyword = ref('')
const sleepVisible = ref(false)

const favoriteSongs = ref<Song[]>([])

// ========== 组合业务模块 ==========
const { currentTab, navList, navigate } = usePlayerNavigation()
const {
  sidebarWidth,
  dragging,
  currentMode,
  modeList,
  sceneList,
  currentModeName,
  toggleSidebar,
  swipeHandlers,
} = useListeningMode()
const {
  settingsVisible,
  pickerVisible,
  source,
  sourceOptions,
  currentSourceLabel,
  openSettings,
  confirmSource,
  sleepLabel,
  sleepMinutes,
  setSleepTimer,
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
  removeSavedPlaylist,
} = usePlaylistLibrary({ favoriteSongs })

const { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext } = usePlaylistDiscovery()

const {
  playMode,
  togglePlayMode,
  removeSong,
  shareCurrentSong,
} = usePlayQueue()

// ========== 导航与数据加载 ==========
/** 刷新「我的」页数据：收藏歌曲 + 用户歌单 + 播放历史 */
function refreshOwnerData() {
  getFavoriteList().then((songs) => {
    favoriteSongs.value = songs
  }).catch(() => {})
  fetchUserPlaylists()
  fetchPlayHistory()
}

function onNavigate(tab: string) {
  navigate(tab)
  if (tab === 'owner') {
    // 每次进入「我的」都重新拉取，保证收藏/歌单/历史是最新的
    refreshOwnerData()
  } else if (tab === 'discover') {
    fetchDiscoverPlaylists()
  }
}

// ========== 听歌模式 ==========
const switchingMode = ref(false)

/** 选择任意模式/场景：统一换成最热歌曲歌单并播放 */
async function onSelectMode(mode: string) {
  currentMode.value = mode
  if (switchingMode.value)
    return
  switchingMode.value = true
  try {
    const songs = await getRecommendList()
    if (!songs.length) {
      showToast('暂时没有推荐歌曲')
      return
    }
    await play(songs[0], songs)
    showToast('已切换到最热歌曲')
  } catch (err) {
    console.warn('[mode] 获取最热歌曲失败', err)
    showToast('获取最热歌曲失败，请重试')
  } finally {
    switchingMode.value = false
  }
}

// ========== 歌单抽屉打开 ==========
function onOpenFavorite() {
  openFavoriteContext()
  drawerRef.value?.open()
}

function onOpenHistory() {
  // 立即打开抽屉（先显示空列表），记录在后台拉取后自动刷新
  openHistoryContext()
  drawerRef.value?.open()
}

function onOpenPlaylist(id: number) {
  // 先打开详情页，再异步拉取歌曲，避免等待接口造成点击无响应
  drawerRef.value?.open()
  void openUserPlaylist(id)
}

/** 创建歌单（标题 + 描述），成功后关闭弹窗；请求中禁止重复提交 */
async function onCreatePlaylist(payload: { name: string, desc: string }) {
  if (creatingPlaylist.value)
    return
  creatingPlaylist.value = true
  try {
    const ok = await createPlaylist(payload.name, payload.desc)
    if (ok)
      createVisible.value = false
  } finally {
    creatingPlaylist.value = false
  }
}

// ========== 歌曲操作面板 ==========
/** 当前歌单是否属于自己（用于判断显示删除还是收藏） */
const activePlaylistIsOwner = computed(() => {
  const ctx = activePlaylist.value
  if (!ctx)
    return false
  // 以作者标识为准：收藏的歌单作者是源作者，不能当作本人歌单删除
  if (ctx.userToken)
    return ctx.userToken === userToken.value
  if (typeof ctx.owner === 'boolean')
    return ctx.owner
  return false
})

/** 当前上下文是否允许删除歌曲 */
const canDeleteActionSong = computed(() => {
  const ctx = activePlaylist.value
  if (!ctx)
    return false
  return ctx.source === PlaylistSource.favorite
    || ctx.source === PlaylistSource.playRecord
    || ctx.userToken === userToken.value
})

function onOpenSongActions(song: Song) {
  actionSong.value = song
  songActionVisible.value = true
}

/** 喜欢 / 取消喜欢当前操作歌曲 */
async function onActionFavorite() {
  const song = actionSong.value
  if (!song)
    return
  const next = !isFavoriteSong(song)
  const ok = next ? await addSongToFavorite(song.id) : await removeSongFromFavorite(song.id)
  if (!ok) {
    showToast(next ? '收藏失败' : '取消收藏失败')
    return
  }
  song.favorite = next
  favoriteSongs.value = next
    ? [song, ...favoriteSongs.value.filter(item => item.id !== song.id)]
    : favoriteSongs.value.filter(item => item.id !== song.id)
  showToast(next ? '已收藏' : '已取消收藏')
}

/** 从当前歌单移除操作歌曲 */
function onActionDelete() {
  const song = actionSong.value
  if (song)
    removeSongFromActive(song.id)
  songActionVisible.value = false
}

/** 播放列表页「加歌单」：把当前播放歌曲加入歌单（和歌曲操作面板共用同一个选择弹层） */
function openAddToPlaylistFromQueue() {
  const song = player.currentSong
  if (!song) {
    showToast('还没有播放中的歌曲')
    return
  }
  actionSong.value = song
  addToPlaylistVisible.value = true
}

/** 选择目标歌单 */
async function onSelectPlaylistTarget(target: number | 'favorite') {
  const song = actionSong.value
  if (!song)
    return

  if (target === 'favorite') {
    if (isFavoriteSong(song)) {
      showToast('已在喜欢的歌单中')
    } else {
      const ok = await addSongToFavorite(song.id)
      if (ok) {
        song.favorite = true
        favoriteSongs.value = [song, ...favoriteSongs.value.filter(item => item.id !== song.id)]
        showToast('已添加到喜欢的歌单')
      } else {
        showToast('添加失败')
      }
    }
  } else {
    await addSongToPlaylist(song.id, target)
  }

  addToPlaylistVisible.value = false
  songActionVisible.value = false
}

/** 添加到歌单面板里点「创建歌单」 */
function onCreatePlaylistFromSheet() {
  addToPlaylistVisible.value = false
  createVisible.value = true
}

async function onOpenDiscover(item: PlaylistItem) {
  // 先用歌单基础信息占位打开，再异步补全歌曲
  openContext({
    playlist: { ...item, source: PlaylistSource.discover, userToken: toUserToken(item.user_id) },
    songs: [],
  })
  drawerRef.value?.open()
  openContext(await buildDiscoverContext(item))
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
  refreshOwnerData()
  fetchDiscoverPlaylists()
})
</script>

<style lang="scss" scoped>
.player-layout {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
  // 竖向滚动交给浏览器，横向手势交给侧栏开合
  touch-action: pan-y;

  .player-stage-container {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
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
    flex: 1;
    min-height: 0;
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
