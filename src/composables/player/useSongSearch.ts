/**
 * 歌曲搜索 —— 搜索弹窗、结果列表与加入播放队列
 */
import type { Song } from '@/types/music'
import { addSearchSong, searchSongs } from '@/api/music'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import { showToast } from 'vant'
import type { Ref } from 'vue'
import { reactive, ref, watch } from 'vue'

/** 搜索列表：整个会话内共用，点击搜索结果持续往这里追加 */
const searchList = ref<Song[]>([])
/** 搜索项 id → 后端注册后的真实歌曲，避免重复调用 /api/song/add */
const resolvedSongs = new Map<string | number, Song>()

export function useSongSearch(keyword: Ref<string>, visible: Ref<boolean>) {
  const player = usePlayerStore()

  const state = reactive({
    resultList: [] as Song[],
    loading: false,
    searched: false,
    addingId: null as string | number | null,
  })

  /** 提交搜索（仅键盘确认 / 点击搜索时触发） */
  async function submitSearch() {
    const kw = keyword.value.trim()
    if (!kw) {
      state.resultList = []
      state.searched = false
      return
    }
    if (state.loading) return
    state.loading = true
    state.searched = true
    state.resultList = await searchSongs(kw)
    state.loading = false
  }

  /** 清空关键词时重置为未搜索状态 */
  watch(keyword, (val) => {
    if (!visible.value) return
    if (!val.trim()) {
      state.resultList = []
      state.searched = false
    }
  })

  /** 点击搜索结果：先通过 /api/song/add 拿到真实歌曲，再加入「搜索列表」播放 */
  async function addSongToQueue(song: Song) {
    if (state.addingId != null) return

    let realSong = resolvedSongs.get(song.id)
    if (!realSong) {
      state.addingId = song.id
      try {
        realSong = await addSearchSong(song)
      } catch (err) {
        console.warn('[search] 添加歌曲失败', err)
        showToast('歌曲信息获取失败，请重试')
        return
      } finally {
        state.addingId = null
      }
      if (!realSong?.id) {
        showToast('歌曲信息获取失败，请重试')
        return
      }
      resolvedSongs.set(song.id, realSong)
    }

    let index = searchList.value.findIndex(item => item.id === realSong.id)
    if (index < 0) {
      searchList.value = [...searchList.value, realSong]
      index = searchList.value.length - 1
    }
    // 播放队列切换到搜索列表，后续点击继续往这个列表里加
    player.setPlayList([...searchList.value], index)
    await playByIndex(index)
    visible.value = false
  }

  /** 搜索结果行是否正在播放（搜索项 id 与真实歌曲 id 可能不同） */
  function isSongPlaying(song: Song) {
    const realId = resolvedSongs.get(song.id)?.id ?? song.id
    return realId === player.currentSong?.id
  }

  function closeSearch() {
    visible.value = false
  }

  return { state, submitSearch, addSongToQueue, isSongPlaying, closeSearch }
}
