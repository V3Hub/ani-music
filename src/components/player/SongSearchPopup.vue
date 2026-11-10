<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    :style="{ height: '80%' }"
  >
    <van-nav-bar
      title="搜索"
      left-text="取消"
      left-arrow
      @click-left="closeSearch"
    />
    <div class="search-form">
      <form action="#" @submit.prevent="submitSearch">
        <van-field
          v-model="keyword"
          placeholder="歌曲或歌手"
          maxlength="20"
          clearable
          left-icon="search"
          round
        />
      </form>
    </div>
    <van-loading v-if="state.loading" size="24px" vertical>加载中...</van-loading>
    <van-cell-group v-else inset>
      <van-cell
        v-for="song in state.resultList"
        :key="song.id"
        :class="{ 'list-item-active': song.id === player.currentSong?.id }"
        clickable
        @click="addSongToQueue(song)"
      >
        <template #icon>
          <div class="song-thumb">
            <div
              v-if="song.id === player.currentSong?.id && player.isPlaying"
              class="wave-overlay"
            >
              <div class="wave-box">
                <span /><span /><span />
              </div>
            </div>
            <van-image width="55" height="55" round :src="song.pic ?? ''" />
          </div>
        </template>
        <template #title>{{ song.title }}</template>
        <template #label>{{ song.singer }}</template>
      </van-cell>
      <van-empty v-if="!state.resultList.length" description="暂无搜索结果" />
    </van-cell-group>
  </van-popup>
</template>

<script setup lang="ts">
import { useSongSearch } from '@/composables/player/useSongSearch'
import { usePlayerStore } from '@/stores/player'

const keyword = defineModel<string>('keyword', { required: true })
const visible = defineModel<boolean>('visible', { required: true })

const player = usePlayerStore()
const { state, submitSearch, addSongToQueue, closeSearch } = useSongSearch(keyword, visible)
</script>

<style lang="scss" scoped>
.search-form {
  padding: 12px 16px;
}

.song-thumb {
  position: relative;

  .wave-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
  }
}
</style>
