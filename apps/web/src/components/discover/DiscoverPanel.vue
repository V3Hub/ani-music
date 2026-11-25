<template>
  <div class="discover-panel">
    <div class="search-bar">
      <van-icon name="search" size="18" class="search-icon" />
      <input
        v-model="keyword"
        class="search-input"
        type="search"
        placeholder="搜索歌单名称"
        enterkeyhint="search"
      >
      <van-icon v-if="keyword" name="clear" size="16" class="search-clear" @click="keyword = ''" />
    </div>

    <div v-if="displayItems.length" class="playlist-grid">
      <div
        v-for="item in displayItems"
        :key="item.id"
        class="grid-cell"
        @click="emit('open', item)"
      >
        <PlaylistCard
          :item="item"
          :is-active="playingPlaylist?.source === 'discover' && playingPlaylist?.id === item.id"
          :is-playing="isPlaying"
        />
      </div>
    </div>

    <div v-else class="empty-tip">
      {{ emptyTip }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'
import PlaylistCard from '@/components/playlist/PlaylistCard.vue'
import { searchPlaylists } from '@/api/music'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  items: PlaylistItem[]
  /** 当前队列所属歌单：只有它在播放时才显示波纹 */
  playingPlaylist: PlaylistItem | null
  isPlaying: boolean
}>()

const emit = defineEmits<{
  (e: 'open', item: PlaylistItem): void
}>()

const keyword = ref('')
const results = ref<PlaylistItem[]>([])
const searching = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let requestSeq = 0

/** 有关键词时显示搜索结果，否则显示推荐列表 */
const displayItems = computed(() => keyword.value.trim() ? results.value : props.items)

const emptyTip = computed(() => {
  if (!keyword.value.trim())
    return '暂无推荐歌单'
  return searching.value ? '搜索中…' : '没有找到相关歌单'
})

/** 仅按歌单名称搜索，输入防抖 300ms */
watch(keyword, (value) => {
  if (timer)
    clearTimeout(timer)
  const kw = value.trim()
  if (!kw) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  timer = setTimeout(async () => {
    const seq = ++requestSeq
    try {
      const list = await searchPlaylists(kw)
      if (seq === requestSeq)
        results.value = list || []
    } catch {
      if (seq === requestSeq)
        results.value = []
    } finally {
      if (seq === requestSeq)
        searching.value = false
    }
  }, 300)
})

onBeforeUnmount(() => {
  if (timer)
    clearTimeout(timer)
})
</script>

<style lang="scss" scoped>
.discover-panel {
  flex: 1;
  min-height: 0;
  padding: 0 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  color: var(--theme-text, #fff);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  margin-bottom: 16px;
  border-radius: 20px;
  background: rgba(128, 128, 128, 0.16);

  .search-icon {
    flex-shrink: 0;
    opacity: 0.55;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    font-size: 13px;
    color: inherit;
    background: transparent;

    &::placeholder {
      opacity: 0.5;
    }

    &::-webkit-search-cancel-button {
      display: none;
    }
  }

  .search-clear {
    flex-shrink: 0;
    opacity: 0.5;
    cursor: pointer;
  }
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.grid-cell {
  min-width: 0;
  cursor: pointer;
}

.empty-tip {
  padding-top: 80px;
  font-size: 14px;
  text-align: center;
  opacity: 0.5;
}
</style>
