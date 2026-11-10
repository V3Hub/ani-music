/**
 * 歌曲搜索 —— 搜索弹窗、结果列表与加入播放队列
 */
import type { Song } from '@/types/music'
import { searchSongs } from '@/api/music'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import type { Ref } from 'vue'
import { reactive } from 'vue'

export function useSongSearch(keyword: Ref<string>, visible: Ref<boolean>) {
  const player = usePlayerStore()

  const state = reactive({
    resultList: [] as Song[],
    loading: false,
  })

  /** 提交搜索 */
  async function submitSearch() {
    if (state.loading) return
    state.loading = true
    state.resultList = await searchSongs(keyword.value)
    state.loading = false
  }

  /** 点击搜索结果：已在队列则直接播放，否则追加到末尾播放 */
  async function addSongToQueue(song: Song) {
    const existIdx = player.playList.findIndex(item => item.id === song.id)
    if (existIdx >= 0) {
      await playByIndex(existIdx)
      visible.value = false
      return
    }
    const nextQueue = [...player.playList, song]
    player.setPlayList(nextQueue, nextQueue.length - 1)
    await playByIndex(nextQueue.length - 1)
    visible.value = false
  }

  function closeSearch() {
    visible.value = false
  }

  return { state, submitSearch, addSongToQueue, closeSearch }
}
