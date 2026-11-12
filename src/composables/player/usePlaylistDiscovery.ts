/**
 * 歌单发现 —— 推荐歌单列表与上下文构建
 */
import type { PlaylistContext, PlaylistItem, Song } from '@/types/music'
import { getPlaylistDetail, getPlaylistDiscover } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { ref } from 'vue'

export const DISCOVER_USER_TOKEN = 'discover'

/** 后端返回的 user_id 转成与 token 前半段一致的 userToken（base64） */
export function toUserToken(userId?: number) {
  return userId != null ? btoa(String(userId)) : DISCOVER_USER_TOKEN
}

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

  return { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext }
}
