<template>
  <div class="admin-page">
    <header class="admin-header">
      <template v-if="selectedUser">
        <button type="button" class="back-btn" @click="selectedUser = null">
          <van-icon name="arrow-left" />
        </button>
        <span class="header-title">与 {{ selectedUser.nickname || ('@' + selectedUser.username) }} 的对话</span>
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
      <!-- 收件箱列表 -->
      <template v-if="!selectedUser">
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
          :key="item.user_id"
          class="request-card clickable"
          @click="openDialog(item)"
        >
          <div class="card-head">
            <div class="user-info">
              <span class="nickname">{{ item.nickname || ('@' + item.username) }}</span>
              <span v-if="item.unread_count > 0" class="unread-tag">{{ item.unread_count }}</span>
              <span v-else class="muted-count">共 {{ item.total }} 条</span>
            </div>
            <span class="time-text">{{ formatTime(item.last_time) }}</span>
          </div>
          <div class="snippet" :class="{ mine: item.from_admin }">
            <span class="snippet-tag">{{ item.from_admin ? '我' : '用户' }}</span>
            <span class="snippet-text">{{ item.content }}</span>
          </div>
        </section>
      </template>

      <!-- 对话详情 -->
      <template v-else>
        <van-loading v-if="dialogLoading" class="page-loading" color="#a78bfa" size="24" />
        <div v-else class="dialog-wrap">
          <div class="dialog-scroll" ref="scrollRef">
            <p v-if="!dialog.length" class="empty-tip">
              暂无对话记录
            </p>
            <div
              v-for="msg in dialog"
              :key="msg.id"
              class="msg-row"
              :class="{ mine: msg.from_admin, user: !msg.from_admin }"
            >
              <div class="msg-bubble">
                <p class="msg-text">{{ msg.content }}</p>
                <span class="msg-time">{{ formatTime(msg.create_time) }}</span>
              </div>
            </div>
          </div>

          <div class="reply-bar">
            <textarea
              v-model="replyContent"
              class="reply-input"
              rows="1"
              maxlength="500"
              placeholder="回复内容（最多 500 字）"
              :disabled="replying"
              ref="inputRef"
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
import { getAdminInbox, getAdminMessages, replyAdminMessage, type AdminInboxItem, type AdminMessageItem } from '@/api/admin-message'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useRouter } from 'vue-router'
import { nextTick, onMounted, ref, watch } from 'vue'

const router = useRouter()

const loading = ref(false)
const inbox = ref<AdminInboxItem[]>([])
const keyword = ref('')

const selectedUser = ref<AdminInboxItem | null>(null)
const dialog = ref<AdminMessageItem[]>([])
const dialogLoading = ref(false)
const replyContent = ref('')
const replying = ref(false)
const scrollRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

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

function openDialog(item: AdminInboxItem) {
  selectedUser.value = item
  loadDialog()
}

watch(selectedUser, (v) => {
  if (!v) dialog.value = []
})

async function loadDialog() {
  if (!selectedUser.value) return
  dialogLoading.value = true
  try {
    dialog.value = await getAdminMessages()
    await nextTick(scrollToBottom)
  } catch {
    // request 层统一 Toast
  } finally {
    dialogLoading.value = false
  }
}

function scrollToBottom() {
  scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'auto' })
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

async function sendReply() {
  const user = selectedUser.value
  const content = replyContent.value.trim()
  if (!user || !content || replying.value) return
  replying.value = true
  try {
    await replyAdminMessage(user.user_id, content)
    replyContent.value = ''
    if (inputRef.value) inputRef.value.style.height = 'auto'
    await loadDialog()
    await loadInbox()
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
    &:active { background: rgba(255, 255, 255, 0.08); }
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
}

.muted-count {
  font-size: 11px;
  opacity: 0.4;
}

.time-text {
  font-size: 11px;
  opacity: 0.4;
  flex-shrink: 0;
}

.snippet {
  display: flex;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.5;
  opacity: 0.7;

  &.mine {
    color: #a78bfa;
  }
}

.snippet-tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
}

.snippet-text {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 对话详情 */
.dialog-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.dialog-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 12px;
}

.msg-row {
  display: flex;
  margin-bottom: 10px;

  &.mine {
    justify-content: flex-end;

    .msg-bubble {
      background: rgba(127, 90, 240, 0.85);
      border-top-right-radius: 4px;
    }
  }

  &.user {
    justify-content: flex-start;

    .msg-bubble {
      background: rgba(255, 255, 255, 0.1);
      border-top-left-radius: 4px;
    }
  }
}

.msg-bubble {
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 14px;
}

.msg-text {
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
  text-align: right;
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
