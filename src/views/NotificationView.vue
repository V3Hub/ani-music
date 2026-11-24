<template>
  <div class="notice-page">
    <header class="notice-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">消息通知</span>
      <button v-if="box === 'inbox'" type="button" class="read-all" :disabled="!unreadCount" @click="markAllRead">
        全部已读
      </button>
      <span v-else class="header-placeholder" />
    </header>

    <div class="box-tabs">
      <button :class="['tab', { active: box === 'inbox' }]" type="button" @click="switchBox('inbox')">
        收到的
        <span v-if="unreadCount > 0" class="tab-dot" />
      </button>
      <button :class="['tab', { active: box === 'outbox' }]" type="button" @click="switchBox('outbox')">
        我发出的
      </button>
    </div>

    <main class="notice-main">
      <div v-if="finished && !list.length" class="notice-empty">
        <van-icon name="bell" size="36" />
        <p>{{ box === 'inbox' ? '还没有收到消息' : '还没有发出消息' }}</p>
        <span>{{ box === 'inbox' ? '别人回复你的评论、给你的心愿留言或给你留言时，会出现在这里' : '你回复评论、留言或给别人发的消息，会出现在这里' }}</span>
      </div>

      <ul v-else class="notice-list">
        <li
          v-for="item in list"
          :key="item.id"
          class="notice-item"
          :class="{ unread: !item.read && box === 'inbox' }"
          @click="onOpen(item)"
        >
          <div class="avatar-wrap">
            <img class="avatar" :src="avatarOf(item)" alt="" @click.stop="openUserProfile(item.senderId)">
            <span v-if="!item.read && box === 'inbox'" class="unread-dot" />
          </div>
          <div class="notice-body">
            <div class="notice-head">
              <span v-if="box === 'outbox'" class="me-label">我</span>
              <span class="sender" @click.stop="openUserProfile(item.senderId)">{{ box === 'outbox' ? '发给 ' : '' }}{{ item.senderName || '游客' }}</span>
              <span class="action">{{ actionText(item) }}</span>
              <span class="time">{{ formatTime(item.createTime) }}</span>
            </div>
            <p class="content">
              {{ item.content }}
            </p>
            <p v-if="item.targetTitle" class="target">
              <van-icon :name="targetIcon(item)" size="12" />
              {{ item.targetTitle }}
            </p>
            <div v-if="box === 'inbox'" class="actions">
              <button v-if="canReply(item)" class="reply-btn" type="button" @click.stop="openReply(item)">
                <van-icon name="chat-o" />
                <span>回复</span>
              </button>
              <button class="delete-btn" type="button" :disabled="deletingId === item.id" @click.stop="deleteItem(item)">
                <van-icon name="delete-o" />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <button v-if="!finished" type="button" class="load-more" :disabled="loading" @click="loadMore()">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </main>

    <ContactAdminSheet v-model:visible="contactVisible" />
    <NotificationReplySheet v-model:visible="replyVisible" :item="replyItem" @sent="onReplySent" />
  </div>
</template>

<script setup lang="ts">
import type { UserNotification } from '@/types/notification'
import { getNotifications, markNotificationsRead, deleteNotifications } from '@/api/notification'
import ContactAdminSheet from '@/components/settings/ContactAdminSheet.vue'
import NotificationReplySheet from '@/components/notification/NotificationReplySheet.vue'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const PAGE_SIZE = 20

const router = useRouter()
const list = ref<UserNotification[]>([])
const page = ref(1)
const finished = ref(false)
const loading = ref(false)
const contactVisible = ref(false)
const replyVisible = ref(false)
const replyItem = ref<UserNotification | null>(null)
const box = ref<'inbox' | 'outbox'>('inbox')
const deletingId = ref<number | null>(null)

/** 删除单条通知（仅自己收到的可删） */
async function deleteItem(item: UserNotification) {
  if (deletingId.value) return
  deletingId.value = item.id
  try {
    await deleteNotifications(item.id)
    list.value = list.value.filter(n => n.id !== item.id)
  } catch {
    // 失败由拦截器提示
  } finally {
    deletingId.value = null
  }
}

/** 切换收到的 / 发出的 */
function switchBox(next: 'inbox' | 'outbox') {
  if (box.value === next) return
  box.value = next
  list.value = []
  page.value = 1
  finished.value = false
  loadMore(true)
}

/** 回复成功：若当前在「我发出的」tab，刷新列表把新回复显示在最前面 */
function onReplySent() {
  if (box.value === 'outbox') {
    list.value = []
    page.value = 1
    finished.value = false
    loadMore(true)
  }
}

/** 该类型通知是否支持直接回复 */
function canReply(item: UserNotification) {
  return item.type === 'comment_reply' || item.type === 'wish_message' || item.type === 'user_message'
}

/** 打开回复弹框 */
function openReply(item: UserNotification) {
  replyItem.value = item
  replyVisible.value = true
  if (!item.read) {
    markNotificationsRead(item.id).then(() => { item.read = true }).catch(() => {})
  }
}

/** 查看用户资料并留言：跳转到账号详情页 */
function openUserProfile(userId: string | number) {
  if (!userId)
    return
  router.push(`/user/${userId}`)
}

const unreadCount = computed(() => list.value.filter(item => !item.read).length)

/** 拉取通知：reset 时从第一页重新加载 */
async function loadMore(reset = false) {
  if (loading.value || (!reset && finished.value))
    return
  loading.value = true
  const target = reset ? 1 : page.value
  try {
    const data = await getNotifications(target, PAGE_SIZE, box.value)
    list.value = reset ? data.list : [...list.value, ...data.list]
    page.value = target + 1
    finished.value = list.value.length >= data.total
  } catch {
    // 错误提示由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}

/** 点击通知：先标记已读；评论回复跳转歌曲；管理员回复打开对话抽屉 */
async function onOpen(item: UserNotification) {
  if (!item.read) {
    try {
      await markNotificationsRead(item.id)
      item.read = true
    } catch {
      // 标记失败不影响查看
    }
  }
  if (item.type === 'comment_reply' && item.targetId) {
    router.push(`/song/${item.targetId}`)
    return
  }
  if (item.type === 'admin_reply' || item.type === 'admin_message') {
    contactVisible.value = true
  }
}

/** 全部标记已读 */
async function markAllRead() {
  if (!unreadCount.value)
    return
  try {
    await markNotificationsRead()
    list.value.forEach((item) => {
      item.read = true
    })
    showToast('已全部标记为已读')
  } catch {
    // 错误提示由请求拦截器统一处理
  }
}

function actionText(item: UserNotification) {
  const out = box.value === 'outbox'
  if (item.type === 'comment_reply')
    return out ? '回复了评论' : '回复了你的评论'
  if (item.type === 'user_message')
    return out ? '留言' : '给你留言'
  if (item.type === 'admin_reply')
    return out ? '回复了管理员' : '回复了你的留言'
  if (item.type === 'admin_message')
    return out ? '联系管理员' : '发来一条留言'
  return out ? '在心愿下留言' : '给你的心愿留言'
}

function targetIcon(item: UserNotification) {
  if (item.type === 'comment_reply') return 'music-o'
  if (item.type === 'admin_reply' || item.type === 'admin_message') return 'service-o'
  return 'flower-o'
}

function avatarOf(item: UserNotification) {
  return resolveAvatarOrDefault(item.senderAvatar, item.senderId)
}

/** 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / 月日 */
function formatTime(ts: number) {
  if (!ts)
    return ''
  const diff = Date.now() - ts
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
  const date = new Date(ts)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}

onMounted(() => loadMore(true))
</script>

<style scoped>
.notice-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.notice-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}

.notice-header .back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}

.notice-header .header-title {
  font-size: 15px;
  opacity: 0.8;
}

.notice-header .read-all {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  cursor: pointer;
}

.notice-header .read-all:disabled {
  opacity: 0.35;
  cursor: default;
}

.box-tabs {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
  position: relative;
  z-index: 1;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.tab.active {
  background: var(--theme-primary);
  color: #fff;
}
.tab-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff4d4f;
}
.header-placeholder {
  width: 60px;
}
.me-label {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  margin-right: 4px;
}

.notice-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px 24px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.notice-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-bottom: 60px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.notice-empty p {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
}

.notice-empty span {
  max-width: 240px;
  font-size: 12px;
  line-height: 1.6;
}

.notice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-item {
  display: flex;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.2s ease;
}

.notice-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.notice-item.unread {
  border-color: rgba(255, 107, 157, 0.35);
  background: rgba(255, 107, 157, 0.07);
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  object-fit: cover;
  cursor: pointer;
}

.unread-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border: 2px solid #141625;
  border-radius: 50%;
  background: #ff6b9d;
}

.notice-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.notice-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.notice-head .sender {
  max-width: 40%;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.notice-head .action {
  color: rgba(255, 255, 255, 0.55);
}

.notice-head .time {
  margin-left: auto;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}

.content {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.target {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.reply-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.reply-btn:active {
  background: rgba(255, 255, 255, 0.12);
}

.delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.delete-btn:active {
  background: rgba(255, 77, 79, 0.18);
  color: #ff7875;
}
.delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.reply-btn .van-icon {
  font-size: 13px;
}

.load-more {
  margin-top: 6px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
}

.load-more:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
