/**
 * 歌曲下载：优先 fetch 成 Blob 保存为本地文件；
 * 跨域音频无法读取时，退化为打开原地址交由浏览器保存。
 */
import type { Song } from '@/types/music'
import { showToast } from 'vant'

/** 生成安全的文件名：标题 - 歌手.扩展名 */
function fileNameOf(song: Song) {
  const raw = `${song.title}${song.singer ? ` - ${song.singer}` : ''}`
  const name = raw.replace(/[\\/:*?"<>|]/g, '_').trim() || 'song'
  const ext = song.url?.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase() || 'mp3'
  return `${name}.${ext}`
}

export async function downloadSong(song: Song) {
  if (!song.url) {
    showToast('该歌曲暂不支持下载')
    return
  }

  showToast('开始下载…')
  try {
    const response = await fetch(song.url)
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)

    const objectUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileNameOf(song)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    showToast('下载完成')
  } catch {
    // 跨域资源无法 fetch 时，直接打开音频地址，用户可另存为
    window.open(song.url, '_blank')
    showToast('已打开音频地址，可右键保存')
  }
}
