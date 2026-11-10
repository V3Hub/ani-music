<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    :style="{ height: '100%' }"
  >
    <van-nav-bar title="播放列表" />
    <div class="queue-header">
      <van-popover
        v-model:show="addMenuVisible"
        :show-action="false"
        trigger="click"
        placement="top"
      >
        <template #reference>
          <div class="queue-action">
            <van-button icon="add-o" plain size="mini" />
            加歌单
          </div>
        </template>
        <van-cell-group>
          <van-cell
            v-for="option in playlistOptions"
            :key="option.key"
            :title="option.label"
            clickable
            @click="onSelectPlaylist(option.key)"
          />
        </van-cell-group>
      </van-popover>
      <div class="queue-action">
        <van-button
          :icon="playMode === 0 ? 'loop-o' : 'replay'"
          plain
          size="mini"
          @click="emit('togglePlayMode')"
        />
        {{ playMode === 0 ? '顺序播放' : '单曲循环' }}
      </div>
      <div class="queue-action">
        <van-button icon="share-o" plain size="mini" @click="emit('share')" />
        分享
      </div>
    </div>
    <van-cell-group class="queue-cells">
      <van-cell
        v-for="(song, index) in player.playList"
        :key="song.id"
        :class="{ 'list-item-active': song.id === player.currentSong?.id }"
        clickable
        @click="playSong(song.id)"
      >
        <template #icon>
          <div class="queue-thumb">
            <div v-if="player.currentSong?.id === song.id" class="wave-overlay">
              <div class="wave-box"><span /><span /><span /></div>
            </div>
            <van-image width="40" height="40" round :src="song.pic ?? ''" />
          </div>
        </template>
        <template #title>{{ song.title }}</template>
        <template #label>{{ song.singer }}</template>
        <template #value>
          <van-button
            icon="delete-o"
            size="mini"
            plain
            @click.stop="emit('removeSong', index)"
          />
        </template>
      </van-cell>
    </van-cell-group>
  </van-popup>
</template>

<script setup lang="ts">
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { usePlayerStore } from '@/stores/player'
import { ref } from 'vue'

defineProps<{
  playlistOptions: { label: string, key: number }[]
  playMode: number
}>()

const emit = defineEmits<{
  (e: 'togglePlayMode'): void
  (e: 'share'): void
  (e: 'removeSong', index: number): void
  (e: 'addToPlaylist', playlistId: number): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { playSong } = usePlaybackControl()
const addMenuVisible = ref(false)

function onSelectPlaylist(playlistId: number) {
  addMenuVisible.value = false
  visible.value = false
  emit('addToPlaylist', playlistId)
}
</script>

<style lang="scss" scoped>
.queue-header {
  display: flex;
  justify-content: space-around;
  width: 100%;
  padding: 12px 20px;
  font-size: 12px;
  color: #646566;

  .queue-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
}

.queue-cells {
  margin-top: 0;
}

.queue-thumb {
  position: relative;
  width: 40px;
  height: 40px;

  .wave-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
  }
}
</style>
