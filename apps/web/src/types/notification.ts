/** 站内消息通知：别人回复你的评论 / 在你的心愿下留言 / 给你留言 / 管理员回复留言 */
export type NotificationType = 'comment_reply' | 'wish_message' | 'user_message' | 'admin_message' | 'admin_reply'

export interface UserNotification {
  id: number
  type: NotificationType
  /** 触发者 users.id */
  senderId: string
  /** 触发者昵称（优先取 users 表最新值） */
  senderName: string
  /** 触发者头像（base64 / data URL / http 地址） */
  senderAvatar: string
  /** 回复 / 留言内容 */
  content: string
  /** comment_reply 时为 song_id，wish_message 时为 wish_id */
  targetId: number
  /** 歌曲名 / 心愿内容摘要 */
  targetTitle: string
  /** comment_reply 时为被回复评论的 id，用于"在通知上直接回复"时作为 parentId */
  refId?: number
  /** comment_reply 时被回复的那条评论原文，用于展示「回复的对象」 */
  refContent?: string
  read: boolean
  /** 毫秒时间戳 */
  createTime: number
}
