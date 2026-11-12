/**
 * 歌单库 —— 用户创建歌单、播放历史、当前歌单上下文
 */
import type { PlaylistContext, PlaylistItem, Song } from '@/types/music'
import {
  addSongToPlaylist as apiAddSongToPlaylist,
  createPlaylist as apiCreatePlaylist,
  createSubPlaylist,
  deletePlaylist as apiDeletePlaylist,
  deleteSubPlaylist as apiDeleteSubPlaylist,
  getPlaylistDetail,
  getPlaylistOwner,
  getPlayRecordList,
  removeSongFromFavorite,
  removeSongFromPlaylist as apiRemoveSongFromPlaylist,
  removeSongFromPlayRecord,
} from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { toUserToken } from '@/composables/player/usePlaylistDiscovery'
import { useUserStore } from '@/stores/user'
import { showToast } from 'vant'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'

export const GUEST_USER_TOKEN = 'guest'

export function usePlaylistLibrary({ favoriteSongs }: { favoriteSongs: Ref<Song[]> }) {
  const userStore = useUserStore()
  // token 形如 `<用户标识>.<签名>`，取前半段作为当前用户标识
  const userToken = computed(() => {
    const token = userStore.getToken()
    if (!token)
      return GUEST_USER_TOKEN
    return token.split('.')[0] || GUEST_USER_TOKEN
  })
  const playlists = ref<PlaylistItem[]>([])
  const playHistory = ref<Song[]>([])
  const activePlaylist = ref<PlaylistItem | null>(null)
  const activeSongs = ref<Song[]>([])

  /** 设置当前打开的歌单上下文 */
  function openContext(context: PlaylistContext) {
    activePlaylist.value = context.playlist
    activeSongs.value = context.songs
  }

  /** 拉取当前用户的歌单列表 */
  async function fetchUserPlaylists() {
    try {
      playlists.value = await getPlaylistOwner() || []
    } catch (err) {
      console.warn('[playlist] 获取用户歌单失败', err)
      playlists.value = []
    }
  }

  /** 拉取播放记录 */
  async function fetchPlayHistory() {
    try {
      playHistory.value = await getPlayRecordList() || []
    } catch (err) {
      console.warn('[playlist] 获取播放记录失败', err)
      playHistory.value = []
    }
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

  /** 打开用户创建/收藏的歌单：先弹出基础信息，再异步补全歌曲 */
  async function openUserPlaylist(id: number) {
    const matched = playlists.value.find(item => item.id === id)
    // 收藏来的歌单要显示源作者：优先用后端 userToken，其次由源作者 user_id 转换
    const authorToken = matched?.userToken
      ?? (matched?.user_id != null ? toUserToken(matched.user_id) : userToken.value)
    openContext({
      playlist: {
        id,
        name: matched?.name ?? '',
        pic: matched?.pic ?? '',
        count: matched?.count ?? 0,
        source: PlaylistSource.playlist,
        userToken: authorToken,
      },
      songs: [],
    })

    try {
      const songs = await getPlaylistDetail(id) || []
      activeSongs.value = songs
      if (activePlaylist.value)
        activePlaylist.value = { ...activePlaylist.value, count: songs.length }
    } catch (err) {
      console.warn('[playlist] 获取歌单详情失败', err)
      showToast('获取歌单详情失败')
    }
  }

  /** 从当前歌单移除歌曲 */
  async function removeSongFromActive(songId: string | number) {
    const playlist = activePlaylist.value
    if (!playlist)
      return

    let ok = false
    if (playlist.source === PlaylistSource.favorite) {
      ok = await removeSongFromFavorite(songId)
      if (ok) {
        const removed = activeSongs.value.find(song => song.id === songId)
        if (removed)
          removed.favorite = false
        favoriteSongs.value = favoriteSongs.value.filter(song => song.id !== songId)
      }
    } else if (playlist.source === PlaylistSource.playRecord) {
      ok = await removeSongFromPlayRecord(Number(songId))
    } else if (playlist.source === PlaylistSource.playlist) {
      ok = await apiRemoveSongFromPlaylist(Number(songId), playlist.id)
    }

    if (!ok) {
      showToast('移除失败')
      return
    }
    activeSongs.value = activeSongs.value.filter(song => song.id !== songId)
    showToast('已从列表移除')
  }

  /** 添加歌曲到指定歌单 */
  async function addSongToPlaylist(songId: string | number, playlistId: number) {
    const ok = await apiAddSongToPlaylist(Number(songId), playlistId)
    if (!ok) {
      showToast('添加失败')
      return
    }
    showToast('已添加到歌单')
    await fetchUserPlaylists()
  }

  /** 创建歌单 */
  async function createPlaylist(name: string, desc: string) {
    const ok = await apiCreatePlaylist(name, desc)
    if (!ok) {
      showToast('创建歌单失败')
      return false
    }
    showToast('歌单已创建')
    await fetchUserPlaylists()
    return true
  }

  /** 删除歌单 */
  async function deletePlaylist(id: number) {
    const ok = await apiDeletePlaylist(id)
    if (!ok) {
      showToast('删除歌单失败')
      return
    }
    playlists.value = playlists.value.filter(item => item.id !== id)
    showToast('歌单已删除')
    await fetchUserPlaylists()
  }

  /** 收藏歌单 */
  async function savePlaylist(id: number) {
    const ok = await createSubPlaylist(id)
    showToast(ok ? '已收藏该歌单' : '收藏失败')
  }

  /** 取消收藏歌单 */
  async function removeSavedPlaylist(id: number) {
    const ok = await apiDeleteSubPlaylist(id)
    if (!ok) {
      showToast('取消收藏失败')
      return
    }
    playlists.value = playlists.value.filter(item => item.id !== id)
    showToast('已取消收藏')
    await fetchUserPlaylists()
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
    removeSavedPlaylist,
  }
}
