import type { Song } from '@/types/music'
import { createShareToken, reportPlaylistShare, reportSongShare } from '@/api/music'
import { showToast } from 'vant'

/** 分享链接固定使用线上站点域名 */
const SHARE_ORIGIN = 'https://music.ani.l.cd'

/** 生成分享链接：https://music.ani.l.cd/song/<token> 或 /playlist/<token> */
export function buildShareUrl(type: 'song' | 'playlist', token: string) {
  return `${SHARE_ORIGIN}/${type}/${token}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 分享单曲：复制「标题 - 歌手 + 链接」，成功后上报分享人数并返回最新人数 */
export async function shareSong(song: Song | null | undefined): Promise<number | null> {
  if (!song?.id) {
    showToast('暂无可分享歌曲')
    return null
  }
  try {
    const { token } = await createShareToken('song', song.id)
    const url = buildShareUrl('song', token)
    const text = `${song.title}${song.singer ? ` - ${song.singer}` : ''}\n${url}`
    const copied = await copyText(text)
    showToast(copied ? '分享链接已复制' : url)
    if (!copied)
      return null
    const { count } = await reportSongShare(song.id)
    return count
  } catch {
    showToast('分享失败，请稍后重试')
    return null
  }
}

/** 分享歌单：复制「歌单名 + 链接」，成功后上报分享人数并返回最新人数 */
export async function sharePlaylist(playlist: { id: number, name: string } | null | undefined): Promise<number | null> {
  if (!playlist?.id) {
    showToast('暂无可分享歌单')
    return null
  }
  try {
    const { token } = await createShareToken('playlist', playlist.id)
    const url = buildShareUrl('playlist', token)
    const copied = await copyText(`${playlist.name}\n${url}`)
    showToast(copied ? '分享链接已复制' : url)
    if (!copied)
      return null
    const { count } = await reportPlaylistShare(playlist.id)
    return count
  } catch {
    showToast('分享失败，请稍后重试')
    return null
  }
}
