<template>
  <van-popup
    v-model:show="visible"
    position="right"
    round
    :style="{ width: '100%', height: '100%' }"
  >
    <van-nav-bar
      fixed
      placeholder
      :title="activePlaylist?.name ?? ''"
      left-text="关闭"
      left-arrow
      @click-left="visible = false"
    />
    <div class="song-list">
      <div class="song-list-header">
        <div class="cover-img">
          <van-image width="100%" height="100%" round :src="activePlaylist?.pic ?? ''" fit="cover" />
        </div>
        <div class="cover-info">
          <div>
            <h3>{{ activePlaylist?.name }}</h3>
            <div class="info">
              <van-image
                round
                width="18"
                height="18"
                :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${activePlaylist?.userToken ?? 'guest'}`"
              />
              {{ activePlaylist?.userToken ?? 'guest' }}
              <div>{{ activePlaylist?.desc }}</div>
            </div>
          </div>
          <div class="cover-actions">
            <van-button :disabled="!activeSongs.length" type="primary" @click="playSongList()">
              <van-icon name="play" />
              播放全部 {{ activeSongs.length }}
            </van-button>
            <van-popover
              v-if="activePlaylist?.source === PlaylistSource.playlist"
              v-model:show="isHeaderMenuOpen"
              trigger="click"
              placement="bottom-start"
              :show-action="false"
            >
              <template #reference>
                <van-button plain icon="ellipsis" />
              </template>
              <van-cell-group>
                <van-cell
                  v-for="action in playlistActions"
                  :key="action.key"
                  :title="action.label"
                  clickable
                  @click="onPlaylistAction(String(action.key))"
                />
              </van-cell-group>
            </van-popover>
          </div>
        </div>
      </div>
      <div class="song-list-content">
        <van-cell-group>
          <van-cell
            v-for="(item, index) in activeSongs"
            :key="item.id"
            :class="{ 'list-item-active': item.id === currentSong?.id }"
            clickable
            @click="playSongList(item.id)"
          >
            <template #icon>
              <div class="song-index-wrap">
                <div v-if="currentSong?.id === item.id && isPlaying" class="wave-box">
                  <span /><span /><span />
                </div>
                <span v-else class="song-index">{{ Number(index) + 1 }}</span>
              </div>
            </template>
            <template #title>{{ item.title }}</template>
            <template #label>{{ item.singer }}{{ item.album ? `-${item.album}` : '' }}</template>
            <template #value>
              <van-popover
                trigger="click"
                placement="bottom-end"
                :show-action="false"
              >
                <template #reference>
                  <van-button plain size="mini" icon="ellipsis" />
                </template>
                <van-cell-group>
                  <van-cell
                    v-for="action in songActions"
                    :key="action.key"
                    :title="action.label"
                    clickable
                    @click="onSongAction(String(action.key), item)"
                  />
                </van-cell-group>
              </van-popover>
            </template>
          </van-cell>
        </van-cell-group>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Song, PlaylistItem } from '@/types/music'
import { PlaylistSource } from '@/constants/playlist'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import { computed, ref, watch } from 'vue'
import { useSwipe } from '@vueuse/core'

interface ActionOption { label: string, key: string }

const props = defineProps<{
  playlists: PlaylistItem[]
  activePlaylist: PlaylistItem | null
  activeSongs: Song[]
  favoriteSongs?: Song[]
}>()

const emit = defineEmits<{
  (e: 'delete', id: string | number): void
  (e: 'addToPlaylist', songId: string | number, playlistId: number): void
  (e: 'deletePlaylist', id: number): void
  (e: 'addSubPlaylist', id: number): void
  (e: 'favorite', id?: string | number): void
}>()

const player = usePlayerStore()
const currentSong = computed(() => player.currentSong)
const isPlaying = computed(() => player.isPlaying)

const visible = ref(false)
const isHeaderMenuOpen = ref(false)
const localUserToken = ref('guest')

const songActions = computed<ActionOption[]>(() => {
  const arr: ActionOption[] = []
  if (props.playlists?.length) {
    const children = props.playlists.filter(item =>
      item.id !== props.activePlaylist?.id && item.owner,
    )
    children.forEach(item => arr.push({ label: `添加到 ${item.name}`, key: `addToPlaylist:${item.id}` }))
  }
  if (props.activePlaylist?.userToken === localUserToken.value || props.favoriteSongs) {
    arr.push({ label: '删除', key: 'delete' })
  }
  return arr
})

const playlistActions = computed<ActionOption[]>(() => {
  const arr: ActionOption[] = [{ label: '分享', key: 'share' }]
  if (localUserToken.value !== props.activePlaylist?.userToken) {
    arr.push({ label: '收藏', key: 'add' })
  }
  if (props.activePlaylist?.userToken === localUserToken.value) {
    arr.push({ label: '删除', key: 'delete' })
  }
  return arr
})

function open() {
  visible.value = true
}
defineExpose({ open })

function onPlaylistAction(val: string) {
  isHeaderMenuOpen.value = false
  if (val === 'share') {
    visible.value = false
  } else if (val === 'delete') {
    emit('deletePlaylist', props.activePlaylist?.id as number)
    visible.value = false
  } else if (val === 'add') {
    emit('addSubPlaylist', props.activePlaylist?.id as number)
  }
}

async function playSongList(id?: string | number) {
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

function onSongAction(val: string, song: Song) {
  if (val.startsWith('addToPlaylist:')) {
    const pid = Number(val.split(':')[1])
    emit('addToPlaylist', song.id, pid)
  } else if (val === 'delete') {
    emit('delete', song.id)
  }
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
.song-list {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 46px;

  &-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;

    .cover-img {
      width: 120px;
      aspect-ratio: 1 / 1;
      border-radius: 12px;
      overflow: hidden;
    }

    .cover-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      align-items: start;
      padding: 15px;
      gap: 16px;

      > div {
        display: flex;
        flex-direction: column;
        gap: 8px;

        h3 {
          font-size: 20px;
          font-weight: 500;
          margin: 0;
        }

        .info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #646566;
        }
      }
    }

    .cover-actions {
      display: flex;
      gap: 25px;
      flex-direction: row;
    }
  }

  &-content {
    flex: 1;
    overflow-y: auto;
  }
}

.song-index-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-index {
  font-size: 14px;
  color: #969799;
}
</style>
