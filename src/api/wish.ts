import type { Wish, WishMessage } from '@/types/wish'
import { request } from '@/utils/request'

/** 最近 30 天的心愿，按点赞数倒序 */
export async function getWishes(): Promise<Wish[]> {
  return request.get<Wish[]>('/api/wish/list')
}

/** 发表心愿 */
export async function addWish(content: string): Promise<Wish> {
  return request.post<Wish>('/api/wish/add', { content })
}

/** 点赞 / 取消点赞 */
export async function toggleWishLike(id: number): Promise<{ liked: boolean, likeCount: number }> {
  return request.post<{ liked: boolean, likeCount: number }>('/api/wish/like', { id })
}

/** 心愿留言列表 */
export async function getWishMessages(wishId: number): Promise<WishMessage[]> {
  return request.get<WishMessage[]>('/api/wish/messages', { params: { wishId } })
}

/** 给心愿留言 */
export async function addWishMessage(wishId: number, content: string): Promise<WishMessage> {
  return request.post<WishMessage>('/api/wish/message/add', { wishId, content })
}

/** 管理员删除心愿：连同点赞与留言一并删除 */
export async function deleteWish(id: number): Promise<void> {
  await request.post('/api/wish/delete', { id })
}
