<template>
  <div class="notice-page">
    <header class="notice-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">消息通知</span>
      <button type="button" class="read-all" :disabled="!unreadCount" @click="markAllRead">
        {{ unreadCount ? `全部已读 (${unreadCount})` : '全部已读' }}
      </button>
    </header>

    <main class="notice-main">
      <div v-if="finished && !list.length" class="notice-empty">
        <van-icon name="bell" size="36" />
        <p>还没有收到消息</p>
        <span>别人回复你的评论、给你的心愿留言或给你留言时，会出现在这里</span>
      </div>

      <ul v-else class="notice-list">
        <li
          v-for="item in list"
          :key="item.id"
          class="notice-item"
          :class="{ unread: !item.read }"
          @click="onOpen(item)"
        >
          <div class="avatar-wrap">
            <img class="avatar" :src="avatarOf(item)" alt="" @click.stop="openUserProfile(item.senderId)">
            <span v-if="!item.read" class="unread-dot" />
          </div>
          <div class="notice-body">
            <div class="notice-head">
              <span class="sender" @click.stop="openUserProfile(item.senderId)">{{ item.senderName || '游客' }}</span>
              <span class="action">{{ actionText(item) }}</span>
              <span class="time">{{ formatTime(item.createTime) }}</span>
            </div>
            <p class="content">
              {{ item.content }}
            </p>
            <p v-if="item.targetTitle" class="target">
              <van-icon :name="item.type === 'comment_reply' ? 'music-o' : 'flower-o'" size="12" />
              {{ item.targetTitle }}
            </p>
          </div>
        </li>
      </ul>

      <button v-if="!finished" type="button" class="load-more" :disabled="loading" @click="loadMore()">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { UserNotification } from '@/types/notification'
import { getNotifications, markNotificationsRead } from '@/api/notification'
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
    const data = await getNotifications(target, PAGE_SIZE)
    list.value = reset ? data.list : [...list.value, ...data.list]
    page.value = target + 1
    finished.value = list.value.length >= data.total
  } catch {
    // 错误提示由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}

/** 点击通知：先标记已读；评论回复跳转到对应歌曲 */
async function onOpen(item: UserNotification) {
  if (!item.read) {
    try {
      await markNotificationsRead(item.id)
      item.read = true
    } catch {
      // 标记失败不影响查看
    }
  }
  if (item.type === 'comment_reply' && item.targetId)
    router.push(`/song/${item.targetId}`)
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
  if (item.type === 'comment_reply')
    return '回复了你的评论'
  if (item.type === 'user_message')
    return '给你留言'
  return '给你的心愿留言'
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
