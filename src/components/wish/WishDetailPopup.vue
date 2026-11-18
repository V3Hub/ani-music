<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="wish-detail-popup"
    :style="{ height: '74%' }"
    @update:show="emit('update:visible', $event)"
    @closed="onClosed"
  >
    <div class="detail-wrap" :style="dragStyle">
      <header
        class="detail-head"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
        @touchcancel="onDragCancel"
        @click="onHeadClick"
      >
        <span class="grab" />
        <h2 class="detail-title">
          心愿详情
        </h2>
        <van-icon name="cross" class="detail-close" />
      </header>

      <div
        ref="bodyRef"
        class="detail-body"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
        @touchcancel="onDragCancel"
      >
        <template v-if="wish">
          <article class="detail-card">
            <van-icon name="star-o" class="card-star" />
            <p class="detail-content">
              {{ wish.content }}
            </p>
            <div class="detail-meta">
              <img class="avatar" :src="wishAvatarUrl(wish.userId, wish.avatar)" alt="">
              <span class="user">{{ wishUserName(wish.userId, wish.nickname) }}</span>
              <span class="time">{{ formatWishTime(wish.createTime) }}</span>
            </div>
          </article>

          <button class="like-btn" :class="{ liked }" @click="handleLike">
            <van-icon :name="liked ? 'liked' : 'like-o'" />
            <span>{{ liked ? '已点亮' : '点亮心愿' }} · {{ likeCount }}</span>
          </button>

          <div class="message-head">
            <span>{{ messages.length ? '心愿留言' : '还没有留言' }}</span>
            <span class="message-count">{{ messages.length }}</span>
          </div>

          <van-loading v-if="loadingMessages" class="message-loading" color="#c4b5fd" size="18" />

          <p v-else-if="!messages.length" class="message-empty">
            说点温暖的话，帮 TA 把心愿点亮
          </p>

          <ul v-else class="message-list">
            <li v-for="message in messages" :key="message.id" class="message-item">
              <img class="avatar" :src="wishAvatarUrl(message.userId, message.avatar)" alt="">
              <div class="message-main">
                <div class="message-top">
                  <span class="user">
                    {{ wishUserName(message.userId, message.nickname) }}
                    <i v-if="message.mine" class="mine">我的</i>
                  </span>
                  <span class="time">{{ formatWishTime(message.createTime) }}</span>
                </div>
                <p class="message-content">
                  {{ message.content }}
                </p>
              </div>
            </li>
          </ul>
        </template>
      </div>

      <footer class="detail-foot">
        <button type="button" class="foot-trigger" @click="openEditor">
          <van-icon name="edit" />
          <span>留下一句祝福…</span>
        </button>
      </footer>
    </div>
  </van-popup>

  <van-popup
    v-model:show="editorVisible"
    position="bottom"
    round
    teleport="body"
    class="message-editor"
    @opened="focusEditor"
  >
    <div class="editor-wrap">
      <div class="editor-head">
        <span class="editor-title">写下留言</span>
        <button type="button" class="editor-cancel" @click="editorVisible = false">
          取消
        </button>
      </div>
      <textarea
        ref="editorRef"
        v-model="draft"
        class="editor-input"
        maxlength="100"
        rows="3"
        placeholder="留下一句祝福…"
      />
      <div class="editor-foot">
        <div class="editor-tools">
          <span class="editor-count">{{ draft.length }}/100</span>
        </div>
        <button
          type="button"
          class="editor-send"
          :disabled="!draft.trim() || sending"
          @click="sendMessage"
        >
          {{ sending ? '发送中' : '发送' }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Wish, WishMessage } from '@/types/wish'
import { addWishMessage, getWishMessages, toggleWishLike } from '@/api/wish'
import { formatWishTime, wishAvatarUrl, wishUserName } from '@/utils/wish'
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  wish: Wish | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'change': [payload: { id: number, liked?: boolean, likeCount?: number, messageCount?: number }]
  'closed': []
}>()

const bodyRef = ref<HTMLElement | null>(null)
const messages = ref<WishMessage[]>([])
const loadingMessages = ref(false)
const sending = ref(false)
const draft = ref('')
const editorVisible = ref(false)
const editorRef = ref<HTMLTextAreaElement>()
const liked = ref(false)
const likeCount = ref(0)
const liking = ref(false)

// ========== 下拉关闭：拖动顶部标题栏，避免与留言列表滚动冲突 ==========
const CLOSE_DISTANCE = 80
const dragY = ref(0)
const dragging = ref(false)
let dragStartY = 0
/** 本次触摸是否发生拖动：拖动松手后的 click 不当作点击关闭 */
let dragged = false

const dragStyle = computed(() => ({
  transform: `translate3d(0, ${dragY.value}px, 0)`,
  transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
}))

function onDragStart(event: TouchEvent) {
  // 内容区只有在已滚到顶部时才允许下拉关闭，否则保留正常滚动
  const target = event.currentTarget as HTMLElement | null
  if (target?.classList.contains('detail-body') && (bodyRef.value?.scrollTop ?? 0) > 0)
    return
  const touch = event.touches[0]
  if (!touch)
    return
  dragStartY = touch.clientY
  dragY.value = 0
  dragged = false
  dragging.value = true
}

function onDragMove(event: TouchEvent) {
  if (!dragging.value)
    return
  const touch = event.touches[0]
  if (!touch)
    return
  const dy = touch.clientY - dragStartY
  dragY.value = Math.max(0, dy)
  if (dragY.value > 6)
    dragged = true
  // 向下拖动时阻止页面级滚动，跟手更顺
  if (dy > 0 && event.cancelable)
    event.preventDefault()
}

function resetDrag() {
  dragging.value = false
  dragY.value = 0
}

/** 关闭动画结束后复位位移：无过渡瞬间归零，避免下次打开残留偏移 */
function resetDragSnap() {
  dragY.value = 0
  requestAnimationFrame(() => {
    dragging.value = false
  })
}

function onDragEnd() {
  if (dragging.value && dragY.value >= CLOSE_DISTANCE) {
    // 保持拖出位置直接关闭，让弹层顺势继续下滑，避免先回弹再关闭的抖动
    close()
    return
  }
  resetDrag()
}

function onDragCancel() {
  resetDrag()
}

function onHeadClick() {
  if (dragged)
    return
  close()
}

function close() {
  emit('update:visible', false)
}

function onClosed() {
  resetDragSnap()
  emit('closed')
}

async function loadMessages() {
  if (!props.wish) return
  loadingMessages.value = true
  try {
    messages.value = await getWishMessages(props.wish.id)
  } finally {
    loadingMessages.value = false
  }
}

function scrollToBottom() {
  const body = bodyRef.value
  if (body) body.scrollTop = body.scrollHeight
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      // 位移留到关闭动画结束（@closed）再复位，避免关闭过程中先回弹再下滑
      editorVisible.value = false
      dragged = false
      return
    }
    if (!props.wish) return
    liked.value = props.wish.liked
    likeCount.value = props.wish.likeCount
    draft.value = ''
    messages.value = []
    await loadMessages()
  },
  { immediate: true },
)

async function handleLike() {
  if (!props.wish || liking.value) return
  // 先更新界面，再同步服务端；失败时回滚
  const prevLiked = liked.value
  const prevCount = likeCount.value
  const nextLiked = !prevLiked
  const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1))
  liked.value = nextLiked
  likeCount.value = nextCount
  emit('change', { id: props.wish.id, liked: nextLiked, likeCount: nextCount })

  liking.value = true
  try {
    const result = await toggleWishLike(props.wish.id)
    liked.value = result.liked
    likeCount.value = result.likeCount
    emit('change', { id: props.wish.id, liked: result.liked, likeCount: result.likeCount })
  } catch {
    liked.value = prevLiked
    likeCount.value = prevCount
    emit('change', { id: props.wish.id, liked: prevLiked, likeCount: prevCount })
  } finally {
    liking.value = false
  }
}

/** 点击底部输入框，弹出留言编辑面板 */
function openEditor() {
  editorVisible.value = true
}

function focusEditor() {
  editorRef.value?.focus()
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || sending.value || !props.wish)
    return
  sending.value = true
  try {
    const message = await addWishMessage(props.wish.id, content)
    messages.value.push(message)
    draft.value = ''
    editorVisible.value = false
    emit('change', { id: props.wish.id, messageCount: message.messageCount })
    await nextTick()
    scrollToBottom()
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.wish-detail-popup {
  color: var(--theme-text, #fff);
  background: transparent;
  overflow: hidden;
}

.detail-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: inherit;
  background: var(--popup-bg);
  will-change: transform;
}

.detail-head {
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
  width: 34px;
  height: 4px;
  margin-left: -17px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.28);
}

.detail-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}

.detail-close {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px 18px 12px;
}

.detail-card {
  position: relative;
  overflow: hidden;
  padding: 18px 16px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
}

.card-star {
  position: absolute;
  top: 12px;
  right: 14px;
  font-size: 16px;
  color: rgba(253, 230, 138, 0.9);
  animation: star-twinkle 2.4s ease-in-out infinite;
}

@keyframes star-twinkle {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.detail-content {
  margin: 0;
  font-size: 15px;
  line-height: 1.75;
  word-break: break-word;
  white-space: pre-wrap;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.user {
  color: rgba(255, 255, 255, 0.74);
}

.time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.like-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 14px;
  padding: 11px 0;
  border: 1px solid rgba(244, 114, 182, 0.35);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #fbcfe8;
  background: rgba(236, 72, 153, 0.12);
  cursor: pointer;
  transition:
    background 0.25s ease,
    color 0.25s ease,
    transform 0.2s ease;
}

.like-btn:active {
  transform: scale(0.98);
}

.like-btn.liked {
  color: #fff;
  background: rgba(251, 113, 133, 0.22);
  border-color: rgba(251, 113, 133, 0.45);
}

.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.message-count {
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.45);
}

.message-loading {
  display: flex;
  justify-content: center;
  padding: 18px 0;
}

.message-empty {
  margin: 0;
  padding: 18px 0 8px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
}

.message-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message-item {
  display: flex;
  gap: 10px;
}

.message-main {
  flex: 1;
  min-width: 0;
}

.message-top {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.mine {
  padding: 0 5px;
  margin-left: 4px;
  border-radius: 6px;
  font-size: 10px;
  font-style: normal;
  color: #fbcfe8;
  background: rgba(236, 72, 153, 0.22);
}

.message-content {
  margin: 4px 0 0;
  padding: 9px 12px;
  border-radius: 12px;
  border-top-left-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  background: rgba(255, 255, 255, 0.07);
}

.detail-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
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
  cursor: text;
}

.foot-trigger:active {
  background: rgba(255, 255, 255, 0.12);
}

.message-editor {
  background: var(--popup-bg-raised);
}

.editor-wrap {
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
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
}

.editor-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
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
  border: 0;
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
}

.editor-send:not(:disabled):active {
  background: rgba(255, 255, 255, 0.28);
}

.editor-send:disabled {
  opacity: 0.4;
  box-shadow: none;
  cursor: not-allowed;
}

.editor-send:not(:disabled):active {
  transform: scale(0.96);
}
</style>
