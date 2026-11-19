/** 心愿墙展示工具：用户头像 / 昵称、相对时间 */
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { resolveDisplayName } from '@/utils/user-token'

/** 有真实头像时用真实头像，否则用 DiceBear（seed 为 userId，同一用户头像固定） */
export function wishAvatarUrl(userId: string, avatar?: string) {
  return resolveAvatarOrDefault(avatar, userId)
}

/** 有真实昵称优先展示，否则数字 userId 展示为 userToken */
export function wishUserName(userId: string, nickname?: string) {
  return resolveDisplayName({ userId, nickname })
}

/** 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / 月日 */
export function formatWishTime(time: number) {
  const diff = Date.now() - time
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute)
    return '刚刚'
  if (diff < hour)
    return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day)
    return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day)
    return `${Math.floor(diff / day)} 天前`
  const date = new Date(time)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}
