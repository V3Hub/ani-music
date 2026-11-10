/**
 * 播放控制 —— 播放/暂停切换、按 id 定位播放、进度跳转
 */
import { usePlayerStore } from '@/stores/player'
import { playByIndex, seek, toggle } from '@/services/audio-player'

export function usePlaybackControl() {
  const player = usePlayerStore()

  /** 切换播放 / 暂停 */
  async function togglePlayback() {
    await toggle()
  }

  /** 按歌曲 id 在队列中定位播放 */
  async function playSong(id: string | number) {
    const idx = player.playList.findIndex(song => song.id === id)
    if (idx >= 0) {
      await playByIndex(idx)
    }
  }

  /** 进度条拖拽结束 */
  function onSeekEnd(val: number) {
    seek(val)
  }

  /** 进度条拖拽中实时跳转 */
  function onSeeking(val: number) {
    seek(val)
  }

  return { togglePlayback, playSong, onSeekEnd, onSeeking }
}
