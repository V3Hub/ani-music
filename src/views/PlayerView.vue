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
        :share-counts="shareCounts"
        :comment-counts="commentCounts"
        @favorite="onFavorite"
        @share="onShareSong"
        @open-comment="onOpenComment"
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
        :nickname="profileStore.nickname"
        :avatar="profileStore.avatar"
        :playlists="playlists"
        :play-history="playHistory"
        :favorite-songs="favoriteSongs"
        :playing-playlist="playingPlaylist"
        :is-playing="player.isPlaying"
        :listen-time="listenTimeText"
        @open-favorite="onOpenFavorite"
        @open-history="onOpenHistory"
        @open-playlist="onOpenPlaylist"
        @create-playlist="createVisible = true"
        @open-settings="openSettings"
        @open-login="router.push('/login')"
      />

      <DiscoverPanel
        v-if="currentTab === 'discover'"
        :items="discoverPlaylists"
        :playing-playlist="playingPlaylist"
        :is-playing="player.isPlaying"
        @open="onOpenDiscover"
      />

      <WelfarePanel v-if="currentTab === 'benefit'" />

      <WishPanel v-if="currentTab === 'wish'" />

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
      @share="onShareSong(player.currentSong)"
      @download="onDownloadCurrent"
      @remove-song="removeSong"
      @open-add-to-playlist="openAddToPlaylistFromQueue"
    />

    <SongListDrawer
      ref="drawerRef"
      :active-playlist="activePlaylist"
      :active-songs="activeSongs"
      :is-owner="activePlaylistIsOwner"
      :subscribed="activePlaylistSubscribed"
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
      :logged-in="userStore.isLoggedIn"
      @confirm-source="confirmSource"
      @set-sleep-timer="setSleepTimer"
      @logout="handleLogout"
    />

    <CreatePlaylistPopup v-model:visible="createVisible" :submitting="creatingPlaylist" @submit="onCreatePlaylist" />

    <SongActionSheet
      v-model:visible="songActionVisible"
      :song="actionSong"
      :is-favorite="actionSong ? isFavoriteSong(actionSong) : false"
      :can-delete="canDeleteActionSong"
      @favorite="onActionFavorite"
      @add-to-playlist="addToPlaylistVisible = true"
      @share="onActionShare"
      @download="onActionDownload"
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

    <SongCommentPopup
      v-model:visible="commentVisible"
      :song="commentSong"
      @count-change="onCommentCountChange"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem, Song } from '@/types/music'
import { addSongToFavorite, fetchSongs, getFavoriteList, getPlaylistInfo, getRecommendList, getSongCommentCount, getSongDetail, getSongShareCount, removeSongFromFavorite, resolveShareToken } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { showToast } from 'vant'
import { useListeningMode } from '@/composables/player/useListeningMode'
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { usePlaylistDiscovery, toUserToken } from '@/composables/player/usePlaylistDiscovery'
import { usePlaylistLibrary } from '@/composables/player/usePlaylistLibrary'
import { usePlayQueue } from '@/composables/player/usePlayQueue'
import { usePlayerNavigation } from '@/composables/player/usePlayerNavigation'
import { usePlaybackSource } from '@/composables/player/usePlaybackSource'
import { useListenTimeStat } from '@/composables/useListenTimeStat'
import { usePlayerStore } from '@/stores/player'
import { useUserStore } from '@/stores/user'
import { useUserProfileStore } from '@/stores/userProfile'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { downloadSong } from '@/utils/download'
import { shareSong } from '@/utils/share'
import { play } from '@/services/audio-player'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DiscoverPanel from '@/components/discover/DiscoverPanel.vue'
import ListeningModeSidebar from '@/components/player/ListeningModeSidebar.vue'
import PlaybackQueuePopup from '@/components/player/PlaybackQueuePopup.vue'
import PlayerBottomNav from '@/components/player/PlayerBottomNav.vue'
import PlayerSettingsPopup from '@/components/player/PlayerSettingsPopup.vue'
import PlayerStage from '@/components/player/PlayerStage.vue'
import PlayerToolbar from '@/components/player/PlayerToolbar.vue'
import SongSearchPopup from '@/components/player/SongSearchPopup.vue'
import SongCommentPopup from '@/components/player/SongCommentPopup.vue'
import SongListDrawer from '@/components/playlist/SongListDrawer.vue'
import CreatePlaylistPopup from '@/components/playlist/CreatePlaylistPopup.vue'
import SongActionSheet from '@/components/playlist/SongActionSheet.vue'
import AddToPlaylistSheet from '@/components/playlist/AddToPlaylistSheet.vue'
import OwnerPanel from '@/components/owner/OwnerPanel.vue'
import WelfarePanel from '@/components/welfare/WelfarePanel.vue'
import WishPanel from '@/components/wish/WishPanel.vue'

const player = usePlayerStore()
const router = useRouter()
const userStore = useUserStore()
const profileStore = useUserProfileStore()

/** 退出登录：清 token 与资料，回到游客身份并刷新数据（刷新时 main.ts 会重新走指纹自动登录） */
function handleLogout() {
  settingsVisible.value = false
  userStore.clearToken()
  profileStore.applyProfile(null)
  window.location.reload()
}

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

/** 歌曲分享人数缓存：歌曲 id -> 人数，切歌时按需拉取 */
const shareCounts = ref<Record<string, number>>({})

/** 歌曲评论数缓存：歌曲 id -> 评论数，切歌时按需拉取 */
const commentCounts = ref<Record<string, number>>({})
const commentVisible = ref(false)
const commentSong = ref<Song | null>(null)

watch(() => player.currentSong?.id, (id) => {
  if (id == null)
    return
  const key = String(id)
  if (shareCounts.value[key] == null) {
    getSongShareCount(id).then(({ count }) => {
      shareCounts.value[key] = count
    }).catch(() => {})
  }
  if (commentCounts.value[key] == null) {
    getSongCommentCount(id).then(({ count }) => {
      commentCounts.value[key] = count
    }).catch(() => {})
  }
}, { immediate: true })

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
const { listenTimeText } = useListenTimeStat()

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

const { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext, insertDiscoverPlaylist } = usePlaylistDiscovery()

/** 播放搜索到的发现页歌单后，把它插入发现页列表 */
watch(() => player.queueSource, (source) => {
  if (source?.type !== 'playlist' || source.playlist.source !== 'discover')
    return
  insertDiscoverPlaylist(source.playlist)
})

/** 当前打开的歌单是否已收藏（自己创建的或已订阅），已收藏则播放时不再自动收藏 */
const activePlaylistSubscribed = computed(() => {
  const id = activePlaylist.value?.id
  return !!id && playlists.value.some(item => item.id === id)
})

const {
  playMode,
  togglePlayMode,
  removeSong,
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

/** 当前队列所属歌单（只有队列来自歌单时用于波纹提示，与「打开了哪个歌单」无关） */
const playingPlaylist = computed(() =>
  player.queueSource?.type === 'playlist' ? player.queueSource.playlist : null,
)

/** 队列来源不是听歌模式（播放歌单 / 搜索列表）时，取消模式的选中态 */
watch(() => player.queueSource, (source) => {
  currentMode.value = source?.type === 'mode' ? source.mode : ''
}, { immediate: true })

/** 选择任意模式/场景：统一换成最热歌曲歌单并播放 */
async function onSelectMode(mode: string) {
  if (switchingMode.value)
    return
  switchingMode.value = true
  const prevSource = player.queueSource
  // 先占位高亮，失败时回滚到播放前的来源
  player.setQueueSource({ type: 'mode', mode })
  try {
    const songs = await getRecommendList()
    if (!songs.length) {
      player.setQueueSource(prevSource)
      showToast('暂时没有推荐歌曲')
      return
    }
    await play(songs[0], songs)
  } catch (err) {
    player.setQueueSource(prevSource)
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

/** 喜欢 / 取消喜欢当前操作歌曲（即时生效，接口后台同步） */
function onActionFavorite() {
  const song = actionSong.value
  if (!song)
    return
  applyFavorite(song, !isFavoriteSong(song))
}

/** 从当前歌单移除操作歌曲 */
function onActionDelete() {
  const song = actionSong.value
  if (song)
    removeSongFromActive(song.id)
  songActionVisible.value = false
}

/** 分享单曲：成功后同步分享人数 */
async function onShareSong(song: Song | null | undefined) {
  if (!song)
    return
  const count = await shareSong(song)
  if (typeof count === 'number')
    shareCounts.value[String(song.id)] = count
}

/** 打开评论弹层 */
function onOpenComment(song: Song) {
  commentSong.value = song
  commentVisible.value = true
}

/** 评论数变化时同步到播放页 */
function onCommentCountChange(count: number) {
  if (commentSong.value)
    commentCounts.value[String(commentSong.value.id)] = count
}

/** 分享当前操作的单曲 */
function onActionShare() {
  onShareSong(actionSong.value)
  songActionVisible.value = false
}

/** 下载当前操作的单曲 */
function onActionDownload() {
  const song = actionSong.value
  songActionVisible.value = false
  if (song)
    downloadSong(song)
}

/** 下载正在播放的歌曲 */
function onDownloadCurrent() {
  const song = player.currentSong
  if (!song) {
    showToast('还没有播放中的歌曲')
    return
  }
  downloadSong(song)
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
    if (isFavoriteSong(song))
      showToast('已在喜欢的歌单中')
    else
      applyFavorite(song, true)
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

/** 收藏态即时生效：先更新页面，再后台同步接口，失败回滚 */
function applyFavorite(song: Song, next: boolean) {
  const prev = isFavoriteSong(song)
  if (prev === next)
    return
  const prevCount = song.favoriteCount

  // 1. 立即更新页面：歌曲标记 + 收藏列表
  song.favorite = next
  // 收藏数默认按 0 处理，收藏 / 取消时本地 ±1
  song.favoriteCount = Math.max(0, (song.favoriteCount ?? 0) + (next ? 1 : -1))
  favoriteSongs.value = next
    ? [song, ...favoriteSongs.value.filter(item => item.id !== song.id)]
    : favoriteSongs.value.filter(item => item.id !== song.id)

  // 2. 后台同步接口
  function rollback() {
    song.favorite = prev
    song.favoriteCount = prevCount
    const others = favoriteSongs.value.filter(item => item.id !== song.id)
    favoriteSongs.value = prev ? [song, ...others] : others
    showToast(next ? '收藏失败' : '取消收藏失败')
  }

  const request = next ? addSongToFavorite(song.id) : removeSongFromFavorite(song.id)
  request.then((ok) => {
    if (!ok) {
      rollback()
      return
    }
    // 3. 接口成功后拉一次详情，用真实收藏数校正本地估算值
    getSongDetail(song.id).then((detail) => {
      if (typeof detail.favorite === 'boolean')
        song.favorite = detail.favorite
      if (typeof detail.favoriteCount === 'number')
        song.favoriteCount = detail.favoriteCount
      const others = favoriteSongs.value.filter(item => item.id !== song.id)
      favoriteSongs.value = song.favorite ? [song, ...others] : others
    }).catch(() => {})
  }).catch(rollback)
}

/** 收藏 / 取消收藏当前歌曲，并同步本地收藏列表 */
function onFavorite(id?: string | number) {
  const song = player.currentSong
  if (!song || (id != null && song.id !== id))
    return
  applyFavorite(song, !isFavoriteSong(song))
}

onMounted(async () => {
  // 从登录页返回时：切回「我的」页，资料与列表按新账号重新拉取
  if (sessionStorage.getItem(LOGIN_RETURN_OWNER_KEY)) {
    sessionStorage.removeItem(LOGIN_RETURN_OWNER_KEY)
    navigate('owner')
  }
  profileStore.fetchProfile()
  if (player.playList.length === 0) {
    // 首屏播放的是最热歌曲，对应「默认模式」，进入页面即选中（不等接口返回）
    player.setQueueSource({ type: 'mode', mode: 'default' })
    const songs = await fetchSongs()
    player.setPlayList(songs, 0)
  }
  refreshOwnerData()
  fetchDiscoverPlaylists()
  handleShareLink()
})

/** 处理分享链接：/song/<token> 播放单曲；/playlist/<token> 打开歌单（可收藏） */
async function handleShareLink() {
  const pathMatch = window.location.pathname.match(/^\/(song|playlist)\/([\w-]+)\/?$/)
  const params = new URLSearchParams(window.location.search)
  const type = pathMatch ? pathMatch[1] : params.get('share')
  const rawId = pathMatch ? pathMatch[2] : params.get('id')
  if (!type || !rawId)
    return

  // 处理完立即回到首页，避免刷新后重复触发
  window.history.replaceState(null, '', '/')

  try {
    let shareType = type
    let id = rawId
    // 非纯数字视为加密 token，解析出真实类型与 id
    if (!/^\d+$/.test(rawId)) {
      const resolved = await resolveShareToken(rawId)
      shareType = resolved.type
      id = String(resolved.id)
    }

    if (shareType === 'song') {
      const song = await getSongDetail(id)
      if (!song?.id) {
        showToast('分享的歌曲不存在')
        return
      }
      player.setQueueSource(null)
      await play(song, [song])
    } else if (shareType === 'playlist') {
      const item = await getPlaylistInfo(id)
      if (!item?.id) {
        showToast('分享的歌单不存在')
        return
      }
      await onOpenDiscover(item)
    }
  } catch {
    showToast('分享链接无效或已失效')
  }
}
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

    // 电脑端：底部工具栏与屏幕底边留出呼吸空间
    @media (min-width: 768px) {
      padding-bottom: calc(var(--safe-bottom, 0px) + 18px);
    }
  }
}
</style>
