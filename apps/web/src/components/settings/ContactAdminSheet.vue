<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    teleport="body"
    class="admin-popup"
    @closed="resetDrag"
  >
    <div class="admin-wrap" :style="dragStyle">
      <header class="admin-head" v-on="dragHandlers" @click="onHeaderClick">
        <span class="grab" />
        <h3 class="head-title">
          联系管理员<template v-if="messages.length"> ({{ messages.length }})</template>
        </h3>
        <van-icon name="cross" class="head-close" @click.stop="visible = false" />
      </header>

      <div class="admin-scroll">
        <p v-if="loading" class="admin-tip">
          加载中…
        </p>
        <p v-else-if="!messages.length" class="admin-tip">
          还没有留言，给管理员说点什么吧
        </p>

        <template v-else>
          <div v-for="item in messages" :key="item.id" class="msg-item">
            <img class="avatar" :src="myAvatar" alt="">
            <div class="msg-main">
              <p class="author">
                我
              </p>
              <p class="content">
                {{ item.content }}
              </p>
              <div class="meta">
                <span class="meta-time">{{ formatTime(item.create_time) }}</span>
              </div>

              <div v-if="item.replies.length" class="reply-list">
                <div v-for="reply in item.replies" :key="reply.id" class="reply-item">
                  <img class="avatar small" :src="adminAvatar" alt="">
                  <div class="msg-main">
                    <p class="author">
                      管理员
                    </p>
                    <p class="content">
                      {{ reply.content }}
                    </p>
                    <div class="meta">
                      <span class="meta-time">{{ formatTime(reply.create_time) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p v-else class="pending">
                等待管理员回复
              </p>
            </div>

            <button type="button" class="del-btn" aria-label="删除留言" @click="removeMessage(item)">
              <van-icon name="delete-o" />
            </button>
          </div>
        </template>
      </div>

      <footer class="admin-input">
        <button type="button" class="foot-trigger" @click="openEditor">
          <van-icon name="edit" />
          <span>给管理员留言</span>
        </button>
      </footer>
    </div>
  </van-popup>

  <!-- 二级弹层：点击输入框后弹出，与评论输入保持一致 -->
  <van-popup
    v-model:show="editorVisible"
    position="bottom"
    round
    teleport="body"
    class="editor-popup"
    @opened="focusInput"
  >
    <div class="editor-wrap">
      <div class="editor-head">
        <span class="editor-title">写下留言</span>
        <button type="button" class="editor-cancel" @click="editorVisible = false">
          取消
        </button>
      </div>
      <textarea
        ref="inputRef"
        v-model="draft"
        class="editor-input"
        maxlength="500"
        rows="3"
        placeholder="有问题或建议都可以告诉管理员"
      />
      <div class="editor-foot">
        <div class="editor-tools">
          <span class="editor-count">{{ draft.length }}/500</span>
        </div>
        <button
          type="button"
          class="editor-send"
          :disabled="!draft.trim() || sending"
          @click="send"
        >
          {{ sending ? '发送中' : '发送' }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { addAdminMessage, deleteAdminMessage, getMyAdminMessages } from '@/api/admin-message'
import type { AdminMessageItem } from '@/api/admin-message'
import { useSwipeDownClose } from '@/composables/useSwipeDownClose'
import { useUserProfileStore } from '@/stores/userProfile'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { showToast } from 'vant'
import { computed, ref, watch } from 'vue'

const visible = defineModel<boolean>('visible', { required: true })

const profileStore = useUserProfileStore()

const messages = ref<AdminMessageItem[]>([])
const draft = ref('')
const loading = ref(false)
const sending = ref(false)
const editorVisible = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const myAvatar = computed(() => resolveAvatarOrDefault(profileStore.avatar, profileStore.id || 'me'))
const adminAvatar = resolveAvatarOrDefault('', 'admin')

watch(() => visible.value, (show) => {
  if (show) {
    loadMessages()
  } else {
    editorVisible.value = false
  }
})

async function loadMessages() {
  loading.value = true
  try {
    messages.value = await getMyAdminMessages()
  } catch {
    // request 层已统一弹 Toast
  } finally {
    loading.value = false
  }
}

function formatTime(time: string) {
  if (!time) return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return time
  const pad = (n: number) => n.toString().padStart(2, '0')
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openEditor() {
  editorVisible.value = true
}

/** 删除自己发出的留言（连带管理员回复） */
async function removeMessage(item: AdminMessageItem) {
  try {
    await deleteAdminMessage(item.id)
    messages.value = messages.value.filter(msg => msg.id !== item.id)
    showToast('已删除')
  } catch {
    // request 层已统一弹 Toast
  }
}

function focusInput() {
  inputRef.value?.focus()
}

async function send() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  sending.value = true
  try {
    await addAdminMessage(content)
    draft.value = ''
    editorVisible.value = false
    await loadMessages()
  } catch (e: unknown) {
    // 429 频控等后端提示
    const data = (e as { data?: { msg?: string } })?.data
    if (data?.msg) showToast(data.msg)
  } finally {
    sending.value = false
  }
}

// ========== 下拉关闭：头部拖动，避免和列表滚动冲突 ==========
const { dragStyle, handlers: dragHandlers, reset: resetDrag, wasDragged } = useSwipeDownClose({
  onClose: () => {
    visible.value = false
  },
})

/** 点击头部关闭：电脑端没有触摸手势时也能关掉弹层 */
function onHeaderClick() {
  if (wasDragged())
    return
  visible.value = false
}
</script>

<style lang="scss" scoped>
.admin-popup {
  height: 74%;
  // 背景交给内容层：下拉拖动时背景跟内容一起移动
  background: transparent !important;
}

.admin-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--theme-text, #fff);
  /* 比页面底色亮一层，避免弹层和页面糊在一起 */
  background: var(--popup-bg-raised);
  border-radius: inherit;
  will-change: transform;
}

.admin-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 18px 16px 10px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.grab {
  position: absolute;
  top: 7px;
  left: 50%;
  width: 40px;
  height: 4px;
  margin-left: -20px;
  border-radius: 999px;
  /* 跟随主题文字色：深浅背景下都清晰可见 */
  background: currentColor;
  opacity: 0.3;
}

.head-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.head-close {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.admin-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 14px 8px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.admin-tip {
  padding: 28px 0;
  font-size: 13px;
  text-align: center;
  opacity: 0.5;
}

.msg-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 14px;
  /* 卡片比弹层背景再亮一点，保证和背景分得开 */
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);

  & + .msg-item {
    margin-top: 6px;
  }
}

.avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);

  &.small {
    width: 20px;
    height: 20px;
  }
}

.msg-main {
  flex: 1;
  min-width: 0;
}

.author {
  margin: 0 0 2px;
  font-size: 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.55);
}

.content {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 10px;
  opacity: 0.5;
}

/* 删除入口：靠最右，跟随后主题文字色 */
.del-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 15px;
  opacity: 0.45;
  cursor: pointer;
  transition:
    opacity 0.2s,
    background-color 0.2s;

  &:active {
    background: rgba(255, 255, 255, 0.1);
    opacity: 0.9;
  }
}

.reply-list {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.reply-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;

  & + .reply-item {
    margin-top: 6px;
  }

  .author {
    font-size: 9px;
  }

  .content {
    font-size: 12px;
  }
}

.pending {
  margin: 5px 0 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.admin-input {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 16px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.18);
}

.foot-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.38);
  font-size: 13px;
  text-align: left;
  cursor: text;
  overflow: hidden;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &:active {
    background: rgba(255, 255, 255, 0.12);
  }
}

.editor-popup {
  /* 二级弹层比留言列表再亮一层，避免两层弹框糊在一起 */
  background: var(--popup-bg-elevated);
}

.editor-wrap {
  padding: 16px 16px 14px;
  color: var(--theme-text, #fff);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.editor-title {
  font-size: 15px;
  font-weight: 600;
}

.editor-cancel {
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
}

.editor-input {
  display: block;
  width: 100%;
  min-height: 88px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  outline: none;
  resize: none;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}

.editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.editor-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.editor-send {
  height: 34px;
  padding: 0 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    background-color 0.2s ease;

  &:not(:disabled):active {
    background: rgba(255, 255, 255, 0.28);
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>
