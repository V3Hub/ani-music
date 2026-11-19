/** 歌曲标签 —— 用户打标签 / 取消标签，管理员查看与清理 */
import type { PageResult } from '@/types/api'
import type { AdminSongTagItem, AdminSongTagQuery, HotSongTagItem, SongTagItem } from '@/types/songTag'
import { request } from '@/utils/request'

/** 热门标签：听歌模式的「标签模式」据此动态生成 */
export function getHotSongTags(limit = 12) {
  return request.get<HotSongTagItem[]>('/api/song/tags', { params: { limit } })
}

/** 当前歌曲的全部标签（含使用人数与是否为自己所打） */
export function getSongTags(songId: number | string) {
  return request.get<SongTagItem[]>('/api/song/tag', { params: { songId } })
}

/** 给歌曲添加标签 */
export function addSongTag(songId: number | string, tag: string) {
  return request.post<null>('/api/song/tag', { songId, tag })
}

/** 取消自己给歌曲打的标签 */
export function removeSongTag(songId: number | string, tag: string) {
  return request.post<null>('/api/song/tag/delete', { songId, tag })
}

/** 管理员：标签列表（分页） */
export function getAdminSongTags(query: AdminSongTagQuery = {}) {
  return request.get<PageResult<AdminSongTagItem>>('/api/admin/song-tags', { params: query })
}

/** 管理员：删除单条标签 */
export function deleteAdminSongTag(id: number) {
  return request.post<null>('/api/admin/song-tag/delete', { id })
}

/** 管理员：删除某个标签名的全部记录 */
export function deleteAdminSongTagByName(tag: string) {
  return request.post<{ count: number }>('/api/admin/song-tag/delete-tag', { tag })
}
