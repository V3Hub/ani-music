/**
 * 播放队列 —— 队列抽屉、播放模式与分享
 */
import type { Song } from '@/types/music'
import { pause, playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import { showToast } from 'vant'
import { computed, ref } from 'vue'

export function usePlayQueue() {
  const player = usePlayerStore()

  const queueVisible = ref(false)

  /** 0=顺序 1=单曲循环（UI 数字映射） */
  const playMode = computed(() => (player.playMode === 'loop' ? 1 : 0))

  function openQueue() {
    queueVisible.value = true
  }

  function closeQueue() {
    queueVisible.value = false
  }

  /** 从队列移除歌曲 */
  async function removeSong(index: number) {
    const removed = player.playList[index]
    const nextList = player.playList.filter((_song: Song, i: number) => i !== index)
    player.setPlayList(nextList, player.currentIndex)
    if (player.currentSong?.id === removed.id) {
      if (nextList.length > 0) {
        await playByIndex(Math.min(index, nextList.length - 1))
      } else {
        pause()
      }
    } else if (player.currentIndex > index) {
      player.setCurrentIndex(player.currentIndex - 1)
    }
  }

  function togglePlayMode() {
    if (player.playMode === 'list') {
      player.setPlayMode('loop')
      showToast('单曲循环')
    } else {
      player.setPlayMode('list')
      showToast('顺序播放')
    }
  }

  /** 复制当前歌曲分享链接 */
  async function shareCurrentSong() {
    const url = `https://ain-music.local/share/${btoa(String(player.currentSong?.id ?? ''))}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('分享链接复制成功')
    } catch {
      showToast(url)
    }
  }

  return {
    queueVisible,
    playMode,
    openQueue,
    closeQueue,
    removeSong,
    togglePlayMode,
    shareCurrentSong,
  }
}
