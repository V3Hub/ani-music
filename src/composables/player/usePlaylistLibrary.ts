/**
 * 歌单库 —— 用户创建歌单、播放历史、当前歌单上下文
 */
import type { PlaylistContext, PlaylistItem, Song } from '@/types/music'
import { fetchSongs } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { showDialog, showToast } from 'vant'
import type { Ref } from 'vue'
import { ref } from 'vue'

export const GUEST_USER_TOKEN = 'guest'

export function usePlaylistLibrary({ favoriteSongs }: { favoriteSongs: Ref<Song[]> }) {
  const userToken = ref(GUEST_USER_TOKEN)
  const playlists = ref<PlaylistItem[]>([])
  const playHistory = ref<Song[]>([])
  const activePlaylist = ref<PlaylistItem | null>(null)
  const activeSongs = ref<Song[]>([])

  /** 设置当前打开的歌单上下文 */
  function openContext(context: PlaylistContext) {
    activePlaylist.value = context.playlist
    activeSongs.value = context.songs
  }

  async function fetchUserPlaylists() {
    playlists.value = [
      { id: 101, name: '我的歌单', desc: '精选', pic: 'https://picsum.photos/seed/p1/300', count: 5, owner: true, user_id: 1, subscribe_count: 0 },
      { id: 102, name: '上班摸鱼', desc: '轻松', pic: 'https://picsum.photos/seed/p2/300', count: 3, owner: true, user_id: 1, subscribe_count: 0 },
    ]
  }

  async function fetchPlayHistory() {
    const songs = await fetchSongs()
    playHistory.value = songs.slice(0, 3)
  }

  /** 打开「我喜欢的」 */
  function openFavoritePlaylist() {
    const songs = favoriteSongs.value
    openContext({
      playlist: {
        id: 0,
        name: '我喜欢的',
        pic: songs[0]?.pic ?? '',
        count: songs.length,
        source: PlaylistSource.favorite,
        userToken: userToken.value,
      },
      songs,
    })
  }

  /** 打开「历史播放」 */
  function openPlayHistory() {
    const songs = playHistory.value
    openContext({
      playlist: {
        id: 0,
        name: '历史播放',
        pic: songs[0]?.pic ?? '',
        count: songs.length,
        source: PlaylistSource.playRecord,
        userToken: userToken.value,
      },
      songs,
    })
  }

  /** 打开用户创建的歌单 */
  async function openUserPlaylist(id: number) {
    const matched = playlists.value.find(item => item.id === id)
    const songs = await fetchSongs()
    openContext({
      playlist: {
        id,
        name: matched?.name ?? '',
        pic: matched?.pic ?? '',
        count: matched?.count ?? 0,
        source: PlaylistSource.playlist,
        userToken: userToken.value,
      },
      songs,
    })
  }

  /** 从当前歌单移除歌曲 */
  function removeSongFromActive(songId: string | number) {
    activeSongs.value = activeSongs.value.filter(song => song.id !== songId)
    showToast('已从列表移除')
  }

  /** 添加歌曲到指定歌单 */
  function addSongToPlaylist(_songId: string | number, playlistId: number) {
    showToast(`已添加到歌单 #${playlistId}`)
  }

  /** 创建歌单 */
  async function createPlaylist() {
    try {
      await showDialog({
        title: '创建歌单',
        message: '歌单将使用默认名称创建',
        showCancelButton: true,
      })
      playlists.value.push({
        id: Date.now(),
        name: '新歌单',
        desc: '',
        count: 0,
        owner: true,
        user_id: 1,
      })
      showToast('歌单已创建')
    } catch { /* 用户取消 */ }
  }

  /** 删除歌单 */
  function deletePlaylist(id: number) {
    playlists.value = playlists.value.filter(item => item.id !== id)
    showToast('歌单已删除')
  }

  /** 收藏歌单 */
  function savePlaylist(_id: number) {
    showToast('已收藏该歌单')
  }

  return {
    userToken,
    playlists,
    playHistory,
    activePlaylist,
    activeSongs,
    openContext,
    fetchUserPlaylists,
    fetchPlayHistory,
    openFavoritePlaylist,
    openPlayHistory,
    openUserPlaylist,
    removeSongFromActive,
    addSongToPlaylist,
    createPlaylist,
    deletePlaylist,
    savePlaylist,
  }
}
