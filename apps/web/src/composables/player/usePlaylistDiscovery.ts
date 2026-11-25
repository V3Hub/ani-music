/**
 * 歌单发现 —— 推荐歌单列表与上下文构建
 */
import type { PlaylistContext, PlaylistItem, Song } from '@/types/music'
import { getPlaylistDetail, getPlaylistDiscover } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { ref } from 'vue'
import { toUserToken } from '@/utils/user-token'

export function usePlaylistDiscovery() {
  const discoverPlaylists = ref<PlaylistItem[]>([])

  async function fetchDiscoverPlaylists() {
    try {
      discoverPlaylists.value = await getPlaylistDiscover() || []
    } catch (err) {
      console.warn('[discover] 获取推荐歌单失败', err)
      discoverPlaylists.value = []
    }
  }

  /** 构建发现歌单的打开上下文 */
  async function buildDiscoverContext(item: PlaylistItem): Promise<PlaylistContext> {
    let songs: Song[] = []
    try {
      songs = await getPlaylistDetail(item.id) || []
    } catch (err) {
      console.warn('[discover] 获取歌单歌曲失败', err)
    }
    return {
      playlist: {
        ...item,
        count: songs.length,
        source: PlaylistSource.discover,
        userToken: item.userToken ?? toUserToken(item.user_id),
      },
      songs,
    }
  }

  /** 播放搜索到的歌单后，把它插到发现页列表最前面（已在列表中则忽略） */
  function insertDiscoverPlaylist(item: PlaylistItem) {
    if (discoverPlaylists.value.some(playlist => playlist.id === item.id))
      return
    discoverPlaylists.value = [item, ...discoverPlaylists.value]
  }

  return { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext, insertDiscoverPlaylist }
}
