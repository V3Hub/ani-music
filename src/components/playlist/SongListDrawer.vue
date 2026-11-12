<template>
  <van-popup
    v-model:show="visible"
    position="right"
    round
    class="song-list-popup"
    :style="{ width: '100%', height: '100%' }"
  >
    <div class="song-list">
      <div class="detail-header">
        <van-icon name="arrow-left" size="20" class="header-icon" @click="visible = false" />
        <van-icon
          v-if="activePlaylist?.source === PlaylistSource.playlist"
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
            :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${activePlaylist?.userToken ?? 'guest'}`"
          />
          <span class="username">{{ activePlaylist?.userToken ?? 'guest' }}</span>
          <span v-if="activePlaylist?.desc" class="playlist-desc">{{ activePlaylist.desc }}</span>
        </div>

        <div class="play-all" :class="{ 'is-disabled': !activeSongs.length }" @click="onPlayAll">
          <div class="play-btn">
            <van-icon name="play" size="16" />
          </div>
          <span>播放全部 {{ activeSongs.length }}</span>
        </div>

        <div class="song-rows">
          <div
            v-for="(item, index) in activeSongs"
            :key="item.id"
            class="song-row"
            :class="{ 'is-current': item.id === currentSong?.id }"
            @click="playSongList(item.id)"
          >
            <div class="row-index">
              <div v-if="currentSong?.id === item.id && isPlaying" class="wave-box">
                <span /><span /><span />
              </div>
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
            <van-icon name="ellipsis" size="18" class="row-more" @click.stop="emit('more', item)" />
          </div>
        </div>
      </div>
    </div>

    <PlaylistActionSheet
      v-model:visible="playlistActionVisible"
      :playlist="activePlaylist"
      :is-owner="isOwner"
      :collected="activePlaylist?.source === PlaylistSource.playlist"
      @favorite="onPlaylistAction('add')"
      @unsubscribe="onPlaylistAction('remove')"
      @delete="onPlaylistAction('delete')"
    />
  </van-popup>
</template>

<script setup lang="ts">
import type { Song, PlaylistItem } from '@/types/music'
import { PlaylistSource } from '@/constants/playlist'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import PlaylistActionSheet from '@/components/playlist/PlaylistActionSheet.vue'
import { computed, ref, watch } from 'vue'
import { useSwipe } from '@vueuse/core'

const props = defineProps<{
  activePlaylist: PlaylistItem | null
  activeSongs: Song[]
  isOwner: boolean
}>()

const emit = defineEmits<{
  (e: 'more', song: Song): void
  (e: 'deletePlaylist', id: number): void
  (e: 'addSubPlaylist', id: number): void
  (e: 'removeSubPlaylist', id: number): void
}>()

const player = usePlayerStore()
const currentSong = computed(() => player.currentSong)
const isPlaying = computed(() => player.isPlaying)

const visible = ref(false)
const playlistActionVisible = ref(false)
const LOGO_URL = '/qs.svg'

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
  }
}

function onPlayAll() {
  if (!props.activeSongs.length)
    return
  playSongList()
}

/** 已在本次会话里自动收藏过的歌单，避免重复请求 */
const autoSubscribedIds = new Set<number>()

/** 播放发现页歌单时，自动收藏整个歌单 */
function autoSubscribeIfNeeded() {
  const playlist = props.activePlaylist
  if (!playlist || playlist.source !== PlaylistSource.discover)
    return
  if (autoSubscribedIds.has(playlist.id))
    return
  autoSubscribedIds.add(playlist.id)
  emit('addSubPlaylist', playlist.id)
}

async function playSongList(id?: string | number) {
  autoSubscribeIfNeeded()
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

// ========== 右滑关闭 ==========
let cleanup: (() => void) | null = null
watch(visible, (val) => {
  if (val) {
    const target = document.querySelector('.van-popup') as HTMLElement | null
    if (target) {
      const { stop } = useSwipe(target, {
        threshold: 80,
        passive: true,
        onSwipeEnd(_, direction) {
          if (direction === 'right') {
            visible.value = false
          }
        },
      })
      cleanup = stop
    }
  } else {
    cleanup?.()
    cleanup = null
  }
})
</script>

<style scoped lang="scss">
.song-list-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.song-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--theme-text, #fff);

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(14px + env(safe-area-inset-top)) 20px 4px;

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
