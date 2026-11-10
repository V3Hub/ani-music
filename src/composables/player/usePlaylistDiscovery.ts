/**
 * 歌单发现 —— 推荐歌单列表与上下文构建
 */
import type { PlaylistContext, PlaylistItem } from '@/types/music'
import { fetchSongs } from '@/api/music'
import { PlaylistSource } from '@/constants/playlist'
import { ref } from 'vue'

export const DISCOVER_USER_TOKEN = 'discover'

export function usePlaylistDiscovery() {
  const discoverPlaylists = ref<PlaylistItem[]>([])

  async function fetchDiscoverPlaylists() {
    discoverPlaylists.value = [
      { id: 201, name: '每日推荐', desc: '根据你的口味', pic: 'https://picsum.photos/seed/d1/300', count: 10, subscribe_count: 128 },
      { id: 202, name: '欧美金曲', desc: '经典永流传', pic: 'https://picsum.photos/seed/d2/300', count: 20, subscribe_count: 98 },
      { id: 203, name: '轻音乐', desc: '专注工作', pic: 'https://picsum.photos/seed/d3/300', count: 15, subscribe_count: 76 },
      { id: 204, name: '深夜电台', desc: '陪你入睡', pic: 'https://picsum.photos/seed/d4/300', count: 8, subscribe_count: 55 },
    ]
  }

  /** 构建发现歌单的打开上下文 */
  async function buildDiscoverContext(item: PlaylistItem): Promise<PlaylistContext> {
    const songs = await fetchSongs()
    return {
      playlist: { ...item, source: PlaylistSource.discover, userToken: DISCOVER_USER_TOKEN },
      songs,
    }
  }

  return { discoverPlaylists, fetchDiscoverPlaylists, buildDiscoverContext }
}
