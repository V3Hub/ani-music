<template>
  <div class="admin-page">
    <header class="admin-header">
      <template v-if="selectedMessage">
        <button type="button" class="back-btn" @click="closeDetail">
          <van-icon name="arrow-left" />
        </button>
        <span class="header-title">留言详情</span>
        <span class="header-space" />
      </template>
      <template v-else>
        <button type="button" class="back-btn" @click="goBack">
          <van-icon name="arrow-left" />
        </button>
        <span class="header-title">用户留言</span>
        <button type="button" class="refresh-btn" @click="loadInbox">
          <van-icon name="replay" />
        </button>
      </template>
    </header>

    <main class="admin-main">
      <!-- 留言列表 -->
      <template v-if="!selectedMessage">
        <div class="search-row">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索用户名 / 昵称"
            @keyup.enter="loadInbox"
          >
          <button
            v-if="keyword"
            type="button"
            class="search-clear"
            @click="clearKeyword"
          >
            <van-icon name="clear" />
          </button>
        </div>

        <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

        <p v-else-if="!inbox.length" class="empty-tip">
          暂无用户留言
        </p>

        <section
          v-for="item in inbox"
          :key="item.id"
          class="request-card clickable"
          @click="openDetail(item)"
        >
          <div class="card-head">
            <div class="user-info">
              <span class="nickname">{{ displayName(item) }}</span>
              <span v-if="!item.reply_count" class="unread-tag">待回复</span>
              <span v-else class="muted-count">已回复 {{ item.reply_count }} 条</span>
            </div>
            <span class="time-text">{{ formatTime(item.create_time) }}</span>
          </div>
          <p class="snippet-text">
            {{ item.content }}
          </p>
        </section>
      </template>

      <!-- 留言详情 -->
      <template v-else>
        <van-loading v-if="dialogLoading" class="page-loading" color="#a78bfa" size="24" />
        <div v-else class="dialog-wrap">
          <div class="dialog-scroll">
            <section class="detail-message">
              <div class="detail-head">
                <span class="nickname">{{ detailName }}</span>
                <span class="time-text">{{ formatTime(selectedMessage.create_time) }}</span>
              </div>
              <p class="detail-text">
                {{ selectedMessage.content }}
              </p>
            </section>

            <p class="reply-title">
              回复记录
            </p>
            <p v-if="!replies.length" class="empty-tip small">
              还没有回复
            </p>
            <div v-for="reply in replies" :key="reply.id" class="reply-item">
              <span class="reply-tag">管理员</span>
              <p class="reply-text">
                {{ reply.content }}
              </p>
              <span class="msg-time">{{ formatTime(reply.create_time) }}</span>
            </div>
          </div>

          <div class="reply-bar">
            <textarea
              ref="inputRef"
              v-model="replyContent"
              class="reply-input"
              rows="1"
              maxlength="500"
              placeholder="回复这条留言（最多 500 字）"
              :disabled="replying"
              @input="autoGrow"
            />
            <button
              type="button"
              class="reply-send"
              :class="{ 'is-disabled': replying || !replyContent.trim() }"
              :disabled="replying || !replyContent.trim()"
              @click="sendReply"
            >
              {{ replying ? '…' : '发送' }}
            </button>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { getAdminInbox, getAdminMessageDetail, replyAdminMessage } from '@/api/admin-message'
import type { AdminInboxItem, AdminMessageReply } from '@/api/admin-message'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useRouter } from 'vue-router'
import { computed, onMounted, ref } from 'vue'

const router = useRouter()

const loading = ref(false)
const inbox = ref<AdminInboxItem[]>([])
const keyword = ref('')

const selectedMessage = ref<AdminInboxItem | null>(null)
const replies = ref<AdminMessageReply[]>([])
const dialogLoading = ref(false)
const replyContent = ref('')
const replying = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const detailName = computed(() => {
  const item = selectedMessage.value
  return item ? displayName(item) : ''
})

function displayName(item: { nickname?: string | null, username?: string | null }) {
  return item.nickname || (item.username ? `@${item.username}` : '用户')
}

onMounted(() => loadInbox())

async function loadInbox() {
  loading.value = true
  try {
    inbox.value = await getAdminInbox(keyword.value.trim())
  } catch {
    // request 层统一 Toast
  } finally {
    loading.value = false
  }
}

function clearKeyword() {
  keyword.value = ''
  loadInbox()
}

function openDetail(item: AdminInboxItem) {
  selectedMessage.value = item
  replies.value = []
  replyContent.value = ''
  loadDetail(item.id)
}

function closeDetail() {
  selectedMessage.value = null
  replies.value = []
  replyContent.value = ''
}

async function loadDetail(id: number) {
  dialogLoading.value = true
  try {
    const data = await getAdminMessageDetail(id)
    replies.value = data.replies
  } catch {
    // request 层统一 Toast
  } finally {
    dialogLoading.value = false
  }
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

async function sendReply() {
  const target = selectedMessage.value
  const content = replyContent.value.trim()
  if (!target || !content || replying.value) return
  replying.value = true
  try {
    await replyAdminMessage(target.id, content)
    replyContent.value = ''
    if (inputRef.value) inputRef.value.style.height = 'auto'
    await loadDetail(target.id)
    await loadInbox()
    // 同步详情页顶部卡片上的回复数
    const updated = inbox.value.find(item => item.id === target.id)
    if (updated) selectedMessage.value = updated
  } finally {
    replying.value = false
  }
}

function formatTime(time: string) {
  if (!time) return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return time
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) return `${diffDays}天前`
  return `${d.getMonth() + 1}-${pad(d.getDate())}`
}

function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.admin-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;

  .back-btn,
  .refresh-btn,
  .header-space {
    width: 34px;
    height: 34px;
  }

  .back-btn,
  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
  }

  .header-title {
    font-size: 15px;
    opacity: 0.8;
    flex: 1;
    text-align: center;
  }
}

.admin-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 24px;
  overflow-y: auto;
}

.page-loading {
  margin-top: 40%;
  display: block;
}

.empty-tip {
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
  padding: 40px 0;

  &.small {
    padding: 12px 0;
  }
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);

  .search-icon {
    opacity: 0.5;
    font-size: 14px;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    outline: none;
    min-width: 0;
  }

  .search-clear {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.4;
    flex-shrink: 0;
    padding: 0;
  }
}

.request-card {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);

  &.clickable {
    cursor: pointer;
    transition: background 0.2s;
    &:active {
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.nickname {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: #ff5c7c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.muted-count {
  font-size: 11px;
  opacity: 0.4;
  flex-shrink: 0;
}

.time-text {
  font-size: 11px;
  opacity: 0.4;
  flex-shrink: 0;
}

.snippet-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 留言详情 */
.dialog-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.dialog-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 12px;
}

.detail-message {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.detail-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.reply-title {
  margin: 14px 0 8px;
  font-size: 12px;
  opacity: 0.5;
}

.reply-item {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: rgba(127, 90, 240, 0.12);
}

.reply-tag {
  display: inline-block;
  margin-bottom: 4px;
  padding: 0 6px;
  border-radius: 3px;
  background: rgba(127, 90, 240, 0.3);
  color: #b9a4ff;
  font-size: 10px;
  line-height: 16px;
}

.reply-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.msg-time {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  opacity: 0.4;
}

.reply-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.reply-input {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font: inherit;
  font-size: 13px;
  resize: none;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: rgba(127, 90, 240, 0.6);
  }
}

.reply-send {
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 17px;
  background: #7f5af0;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}
</style>
