<template>
  <van-popup
    v-model:show="visible"
    position="right"
    class="song-list-popup"
    :style="{ width: '100%', height: '100%' }"
    @closed="onClosed"
  >
    <div class="song-list" :style="swipeStyle" v-on="handlers">
      <div class="detail-header">
        <van-icon name="arrow-left" size="20" class="header-icon" @click="visible = false" />
        <van-icon
          v-if="activePlaylist?.source === PlaylistSource.playlist || activePlaylist?.source === PlaylistSource.discover"
          name="ellipsis"
          size="20"
          class="header-icon header-more"
          @click="playlistActionVisible = true"
        />
      </div>

      <div class="song-list-scroll">
        <div class="cover-hero">
          <div class="cover-back" />
          <div class="cover-img">
            <van-image width="100%" height="100%" fit="cover" :src="activePlaylist?.pic || LOGO_URL">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
        </div>

        <h3 class="playlist-name">{{ activePlaylist?.name }}</h3>

        <div class="playlist-meta">
          <van-image
            round
            width="22"
            height="22"
            :src="authorAvatar"
          />
          <span class="username">{{ authorName }}</span>
          <VipBadge :level="activePlaylist?.vip_level" small />
          <span v-if="activePlaylist?.desc" class="playlist-desc">{{ activePlaylist.desc }}</span>
        </div>

        <div v-if="!sorting" class="play-all" :class="{ 'is-disabled': !activeSongs.length }" @click="onPlayAll">
          <div class="play-btn">
            <van-icon name="play" size="16" />
          </div>
          <span>播放全部 {{ activeSongs.length }}</span>
          <span v-if="canSort" class="sort-entry" @click.stop="enterSort">排序</span>
        </div>
        <div v-else class="play-all sort-mode-bar">
          <span class="sort-tip">拖动右侧手柄调整顺序</span>
          <div class="sort-actions">
            <span class="sort-btn" @click="cancelSort">取消</span>
            <span class="sort-btn sort-confirm" :class="{ 'is-disabled': saving }" @click="saveSort">
              {{ saving ? '保存中…' : '完成' }}
            </span>
          </div>
        </div>

        <div class="song-rows">
          <div
            v-for="(item, index) in displaySongs"
            :key="item.id"
            class="song-row"
            :class="{ 'is-current': item.id === currentSong?.id, 'is-dragging': index === draggingIndex }"
            :style="index === draggingIndex ? { transform: `translateY(${dragY}px)` } : undefined"
            @click="onRowClick(item.id)"
          >
            <div class="row-index">
              <WaveBox v-if="!sorting && currentSong?.id === item.id" :playing="isPlaying" />
              <span v-else class="index-num">{{ index + 1 }}</span>
            </div>
            <div class="row-main">
              <div class="row-title">
                {{ item.title }}
              </div>
              <div class="row-sub">
                {{ item.singer }}<template v-if="item.album"> · {{ item.album }}</template>
              </div>
            </div>
            <van-icon
              v-if="sorting"
              name="bars"
              size="18"
              class="drag-handle"
              @touchstart="onDragStart($event, index)"
            />
            <van-icon v-else name="ellipsis" size="18" class="row-more" @click.stop="emit('more', item)" />
          </div>
        </div>
      </div>
    </div>

    <PlaylistActionSheet
      v-model:visible="playlistActionVisible"
      :playlist="activePlaylist"
      :is-owner="isOwner"
      :collected="subscribed"
      :share-count="playlistShareCount"
      @favorite="onPlaylistAction('add')"
      @unsubscribe="onPlaylistAction('remove')"
      @delete="onPlaylistAction('delete')"
      @share="onPlaylistAction('share')"
    />
  </van-popup>
</template>

<script setup lang="ts">
import type { Song, PlaylistItem } from '@/types/music'
import { PlaylistSource } from '@/constants/playlist'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import PlaylistActionSheet from '@/components/playlist/PlaylistActionSheet.vue'
import VipBadge from '@/components/common/VipBadge.vue'
import WaveBox from '@/components/waveBox/WaveBox.vue'
import { getPlaylistShareCount, sortPlaylistSongs } from '@/api/music'
import { sharePlaylist } from '@/utils/share'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { resolveDisplayName } from '@/utils/user-token'
import { useSwipeClose } from '@/composables/useSwipeClose'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  activePlaylist: PlaylistItem | null
  activeSongs: Song[]
  isOwner: boolean
  /** 该歌单是否已收藏（含自己创建/已订阅） */
  subscribed: boolean
}>()

const emit = defineEmits<{
  (e: 'more', song: Song): void
  (e: 'deletePlaylist', id: number): void
  (e: 'addSubPlaylist', id: number): void
  (e: 'removeSubPlaylist', id: number): void
  (e: 'sorted', songs: Song[]): void
}>()

const player = usePlayerStore()
const currentSong = computed(() => player.currentSong)
const isPlaying = computed(() => player.isPlaying)

const visible = ref(false)
const playlistActionVisible = ref(false)
const playlistShareCount = ref(0)
const LOGO_URL = '/qs.svg'

/** 作者展示名：真实昵称优先，其次 userToken，最后 guest */
const authorName = computed(() => resolveDisplayName({
  nickname: props.activePlaylist?.nickname,
  userToken: props.activePlaylist?.userToken,
}))
/** 作者头像：数据库头像优先，没有则按 userToken 生成默认头像 */
const authorAvatar = computed(() => resolveAvatarOrDefault(
  props.activePlaylist?.avatar,
  props.activePlaylist?.userToken,
))

watch(() => props.activePlaylist?.id, (id) => {
  playlistShareCount.value = 0
  // 「我喜欢的」「历史播放」是本地虚拟歌单（没有真实 id），不请求分享数
  const source = props.activePlaylist?.source
  if (!id || (source !== PlaylistSource.playlist && source !== PlaylistSource.discover))
    return
  getPlaylistShareCount(id).then(({ count }) => {
    playlistShareCount.value = count
  }).catch(() => {})
}, { immediate: true })

function open() {
  visible.value = true
}
defineExpose({ open })

function onPlaylistAction(val: string) {
  playlistActionVisible.value = false
  if (val === 'delete') {
    emit('deletePlaylist', props.activePlaylist?.id as number)
    visible.value = false
  } else if (val === 'add') {
    emit('addSubPlaylist', props.activePlaylist?.id as number)
  } else if (val === 'remove') {
    emit('removeSubPlaylist', props.activePlaylist?.id as number)
    visible.value = false
  } else if (val === 'share') {
    sharePlaylist(props.activePlaylist).then((count) => {
      if (typeof count === 'number')
        playlistShareCount.value = count
    })
  }
}

function onPlayAll() {
  if (sorting.value || !props.activeSongs.length)
    return
  playSongList()
}

async function playSongList(id?: string | number) {
  // 记录队列来源：波纹提示与听歌模式选中态都以它为准
  const playlist = props.activePlaylist
  player.setQueueSource(playlist ? { type: 'playlist', playlist } : null)
  player.setPlayList(props.activeSongs, 0)
  if (id !== undefined) {
    const idx = props.activeSongs.findIndex(song => song.id === id)
    if (idx >= 0)
      await playByIndex(idx)
  } else {
    await playByIndex(0)
  }
  visible.value = false
}

function onRowClick(id: string | number) {
  if (sorting.value)
    return
  playSongList(id)
}

// ========== 拥有者排序模式 ==========
const sorting = ref(false)
const saving = ref(false)
/** 排序模式下的本地副本，保存成功后才同步给父组件 */
const localSongs = ref<Song[]>([])
const displaySongs = computed(() => sorting.value ? localSongs.value : props.activeSongs)

/** 仅真实歌单的拥有者可排序：本地虚拟歌单（我喜欢的/历史播放）没有后端排序概念 */
const canSort = computed(() => {
  const p = props.activePlaylist
  return props.isOwner && !!p?.id
    && (p.source === PlaylistSource.playlist || p.source === PlaylistSource.discover)
    && props.activeSongs.length > 1
})

function enterSort() {
  localSongs.value = [...props.activeSongs]
  sorting.value = true
}

function cancelSort() {
  sorting.value = false
}

async function saveSort() {
  if (saving.value)
    return
  const playlistId = props.activePlaylist?.id
  if (!playlistId)
    return
  saving.value = true
  try {
    await sortPlaylistSongs(playlistId, localSongs.value)
    emit('sorted', [...localSongs.value])
    sorting.value = false
  } catch {
    // request 已统一提示，停留在排序模式允许重试或取消
  } finally {
    saving.value = false
  }
}

// ---- 拖拽排序：手柄按下后跟踪手指，越过半行就与邻项交换 ----
const draggingIndex = ref(-1)
const dragY = ref(0)
let dragStartY = 0
let rowHeight = 0

function onDragStart(event: TouchEvent, index: number) {
  if (saving.value)
    return
  const handle = event.currentTarget as HTMLElement
  const row = handle.closest('.song-row') as HTMLElement | null
  rowHeight = row?.offsetHeight || 64
  draggingIndex.value = index
  dragStartY = event.touches[0].clientY
  dragY.value = 0
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
  window.addEventListener('touchcancel', onDragEnd)
}

function onDragMove(event: TouchEvent) {
  event.preventDefault()
  const list = localSongs.value
  const index = draggingIndex.value
  if (index < 0)
    return
  const dy = event.touches[0].clientY - dragStartY
  // 向下越过半行：与下一项交换，基准点随之下移一行
  if (dy > rowHeight / 2 && index < list.length - 1) {
    list.splice(index, 2, list[index + 1], list[index])
    draggingIndex.value = index + 1
    dragStartY += rowHeight
  } else if (dy < -rowHeight / 2 && index > 0) {
    list.splice(index - 1, 2, list[index], list[index - 1])
    draggingIndex.value = index - 1
    dragStartY -= rowHeight
  }
  dragY.value = event.touches[0].clientY - dragStartY
}

function onDragEnd() {
  draggingIndex.value = -1
  dragY.value = 0
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
  window.removeEventListener('touchcancel', onDragEnd)
}

// ========== 右滑关闭 ==========
const { swipeStyle, handlers, reset } = useSwipeClose(() => {
  if (playlistActionVisible.value)
    return
  visible.value = false
})

function onClosed() {
  onDragEnd()
  sorting.value = false
  saving.value = false
  reset()
}
</script>

<style scoped lang="scss">
.song-list-popup {
  background: transparent !important;
}

.song-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--theme-text, #fff);
  background: var(--popup-bg);
  touch-action: pan-y;

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px 4px;

    .header-icon {
      color: var(--theme-text, #fff);
      cursor: pointer;
    }

    .header-more {
      // ellipsis 默认横向，旋转成竖向三点
      transform: rotate(90deg);
    }
  }

  .song-list-scroll {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 24px;
  }
}

.cover-hero {
  position: relative;
  display: flex;
  justify-content: center;
  height: 232px;
  margin-top: 8px;

  .cover-back {
    position: absolute;
    top: 12px;
    width: 214px;
    height: 214px;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.22);
    transform: rotate(-6deg);
  }

  .cover-img {
    position: relative;
    z-index: 1;
    width: 198px;
    height: 198px;
    margin-top: 12px;
    overflow: hidden;
    border-radius: 14px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);

    .cover-fallback {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 52px;
      object-fit: contain;
      background: rgba(128, 128, 128, 0.16);
    }
  }
}

.playlist-name {
  margin: 20px 20px 12px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--theme-text, #fff);
}

.playlist-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 20px 20px;
  font-size: 13px;
  opacity: 0.7;

  .username {
    flex-shrink: 0;
  }

  .playlist-desc {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.play-all {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 20px 8px;
  font-size: 13px;
  color: var(--theme-text, #fff);
  cursor: pointer;

  &.is-disabled {
    opacity: 0.4;
    cursor: default;
  }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: var(--theme-background, #1a1a1a);
    background: var(--theme-text, #fff);
  }

  .sort-entry {
    margin-left: auto;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.18);
    cursor: pointer;
  }

  &.sort-mode-bar {
    justify-content: space-between;
    min-height: 40px;
    cursor: default;
  }

  .sort-tip {
    opacity: 0.6;
  }

  .sort-actions {
    display: flex;
    gap: 10px;
  }

  .sort-btn {
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.18);
    cursor: pointer;

    &.sort-confirm {
      color: var(--theme-background, #1a1a1a);
      background: var(--theme-text, #fff);
    }

    &.is-disabled {
      opacity: 0.5;
      pointer-events: none;
    }
  }
}

.song-rows {
  padding: 8px 8px 0;
}

.song-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;

  &.is-current .row-title {
    color: #35c46a;
  }

  &.is-dragging {
    position: relative;
    z-index: 2;
    background: var(--popup-bg);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }

  .drag-handle {
    flex-shrink: 0;
    padding: 8px 4px;
    color: var(--theme-text, #fff);
    opacity: 0.65;
    cursor: grab;
    touch-action: none;
  }

  .row-index {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    font-size: 13px;
    opacity: 0.45;
  }

  .row-main {
    display: flex;
    flex: 1;
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
    opacity: 0.55;
  }

  .row-more {
    flex-shrink: 0;
    color: var(--theme-text, #fff);
    opacity: 0.65;
    cursor: pointer;
    // Vant 的 ellipsis 是横向三点，旋转 90° 变成竖向三点
    transform: rotate(90deg);
  }
}
</style>
