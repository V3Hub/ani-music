<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    teleport="body"
    class="comment-popup"
    :style="{ height: '100%' }"
  >
    <div class="comment-wrap" :style="mainDrag.style.value">
      <header
        class="comment-head"
        v-on="mainDrag.handlers"
      >
        <van-icon name="arrow-down" size="20" class="head-icon" @click="visible = false" />
        <h3 class="head-title">
          评论<template v-if="total"> ({{ total }})</template>
        </h3>
        <div class="head-sort">
          <button
            type="button"
            class="sort-btn"
            :class="{ active: sort === 'default' }"
            @click="changeSort('default')"
          >
            默认
          </button>
          <span class="sort-divider">|</span>
          <button
            type="button"
            class="sort-btn"
            :class="{ active: sort === 'latest' }"
            @click="changeSort('latest')"
          >
            最新
          </button>
        </div>
      </header>

      <div class="comment-scroll" @scroll="onScroll">
        <div v-for="item in comments" :key="item.id" class="comment-item">
          <img class="avatar" :src="avatarOf(item.userId)" alt="">
          <div class="comment-main">
            <p class="author">
              {{ displayName(item.userId) }}
            </p>
            <p class="content">
              {{ item.content }}
            </p>
            <div class="meta">
              <span class="meta-time">{{ formatTime(item.createTime) }}</span>
              <button type="button" class="meta-btn" @click="startReply(item)">
                回复
              </button>
              <button v-if="item.mine" type="button" class="meta-btn" @click="onDelete(item)">
                删除
              </button>
            </div>

            <div v-if="item.replies.length" class="reply-list">
              <div v-for="reply in item.replies" :key="reply.id" class="reply-item">
                <img class="avatar small" :src="avatarOf(reply.userId)" alt="">
                <div class="comment-main">
                  <p class="author">
                    {{ displayName(reply.userId) }}
                  </p>
                  <p class="content">
                    {{ reply.content }}
                  </p>
                  <div class="meta">
                    <span class="meta-time">{{ formatTime(reply.createTime) }}</span>
                    <button type="button" class="meta-btn" @click="startReply(reply)">
                      回复
                    </button>
                    <button v-if="reply.mine" type="button" class="meta-btn" @click="onDelete(reply)">
                      删除
                    </button>
                  </div>
                </div>
                <button type="button" class="like-btn" @click="onLike(reply)">
                  <van-icon
                    :name="reply.liked ? 'like' : 'like-o'"
                    :color="reply.liked ? '#FF5C7C' : 'rgba(255,255,255,0.6)'"
                    size="16"
                  />
                  <span v-if="reply.likeCount">{{ reply.likeCount }}</span>
                </button>
              </div>
            </div>

            <button
              v-if="!item.repliesLoaded && item.replyCount"
              type="button"
              class="expand-btn"
              @click="loadReplies(item)"
            >
              —— 展开 {{ item.replyCount }} 条回复
            </button>
          </div>
          <button type="button" class="like-btn" @click="onLike(item)">
            <van-icon
              :name="item.liked ? 'like' : 'like-o'"
              :color="item.liked ? '#FF5C7C' : 'rgba(255,255,255,0.6)'"
              size="16"
            />
            <span v-if="item.likeCount">{{ item.likeCount }}</span>
          </button>
        </div>

        <p v-if="loading" class="comment-tip">
          加载中…
        </p>
        <p v-else-if="finished && !comments.length" class="comment-tip">
          还没有评论，来抢沙发吧
        </p>
      </div>

      <footer class="comment-input">
        <div class="input-trigger" @click="openEditor()">
          {{ replyTarget ? `回复 @${displayName(replyTarget.userId)}` : '喊上朋友来听这首歌' }}
        </div>
      </footer>
    </div>
  </van-popup>

  <!-- 二级弹层：点击输入框后弹出独立的发送界面 -->
  <van-popup
    v-model:show="editorVisible"
    position="bottom"
    round
    teleport="body"
    class="editor-popup"
    @opened="focusInput"
    @closed="onEditorClosed"
  >
    <div class="editor-wrap" :style="editorDrag.style.value">
      <div class="editor-handle" v-on="editorDrag.handlers">
        <span class="handle-bar" />
      </div>
      <div class="input-box">
        <textarea
          ref="inputRef"
          v-model="draft"
          class="input-field"
          rows="1"
          maxlength="500"
          :placeholder="replyTarget ? `回复 @${displayName(replyTarget.userId)}` : '喊上朋友来听这首歌'"
          @input="autoGrow"
        />
      </div>
      <div class="input-toolbar">
        <div class="tool-left">
          <van-icon
            name="smile-o"
            size="22"
            class="tool-icon"
            :class="{ active: emojiOpen }"
            @click="emojiOpen = !emojiOpen"
          />
        </div>
        <button
          type="button"
          class="send-btn"
          :disabled="!draft.trim() || sending"
          @click="submit"
        >
          {{ sending ? '发送中' : '发送' }}
        </button>
      </div>
      <div v-if="emojiOpen" class="emoji-panel">
        <button
          v-for="emoji in EMOJIS"
          :key="emoji"
          type="button"
          class="emoji-btn"
          @click="insertText(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Song, SongComment } from '@/types/music'
import { addSongComment, deleteSongComment, getSongCommentCount, getSongComments, toggleCommentLike } from '@/api/music'
import { toUserToken } from '@/composables/player/usePlaylistDiscovery'
import { showToast } from 'vant'
import { computed, nextTick, ref, watch } from 'vue'

interface CommentNode extends SongComment {
  replies: SongComment[]
  repliesLoaded: boolean
}

const props = defineProps<{
  song: Song | null
}>()

const emit = defineEmits<{
  (e: 'countChange', count: number): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const PAGE_SIZE = 20

const comments = ref<CommentNode[]>([])
const total = ref(0)
const sort = ref<'default' | 'latest'>('default')
const page = ref(1)
const loading = ref(false)
const finished = ref(false)
const draft = ref('')
const sending = ref(false)
const replyTarget = ref<SongComment | null>(null)
const emojiOpen = ref(false)
const editorVisible = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const EMOJIS = [
  '😂',
  '❤️',
  '👍',
  '🎉',
  '🌹',
  '👏',
  '🔥',
  '😭',
  '😍',
  '🥰',
  '😎',
  '🤔',
  '😴',
  '🙏',
  '💪',
  '🎵',
  '✨',
  '💔',
  '😢',
  '😡',
  '🤣',
  '🥁',
  '🎸',
  '🍺',
]

/** 输入框随内容自适应高度，超过上限后内部滚动 */
function autoGrow() {
  const el = inputRef.value
  if (!el)
    return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 108)}px`
}

/** 在光标位置插入文本（表情、@），保持焦点不丢 */
function insertText(text: string) {
  const el = inputRef.value
  if (!el) {
    draft.value += text
    return
  }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? start
  draft.value = draft.value.slice(0, start) + text + draft.value.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + text.length
    el.setSelectionRange(pos, pos)
    autoGrow()
  })
}

function resetInputHeight() {
  const el = inputRef.value
  if (el)
    el.style.height = 'auto'
}

function avatarOf(userId: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId || 'guest')}`
}

/** 展示与歌单一致的 userToken（非数字 id） */
function displayName(userId: string) {
  const value = String(userId || '')
  const numeric = Number(value)
  if (value && Number.isFinite(numeric))
    return toUserToken(numeric)
  return value || 'guest'
}

function formatTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60 * 1000)
    return '刚刚'
  if (diff < 60 * 60 * 1000)
    return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000)
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  if (diff < 30 * 24 * 60 * 60 * 1000)
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function emitCount(count: number) {
  total.value = count
  emit('countChange', count)
}

async function refreshCount() {
  if (!props.song)
    return
  const { count } = await getSongCommentCount(props.song.id)
  emitCount(count)
}

/** 加载一页顶层评论（默认 / 最新） */
async function loadPage() {
  if (!props.song || loading.value || finished.value)
    return
  loading.value = true
  try {
    const list = await getSongComments({
      songId: props.song.id,
      sort: sort.value,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    const nodes = list.map(item => ({ ...item, replies: [], repliesLoaded: false }))
    comments.value = page.value === 1 ? nodes : [...comments.value, ...nodes]
    finished.value = list.length < PAGE_SIZE
    page.value += 1
  } catch {
    finished.value = true
  } finally {
    loading.value = false
  }
}

function onScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120)
    loadPage()
}

async function reset() {
  comments.value = []
  total.value = 0
  page.value = 1
  finished.value = false
  loading.value = false
  replyTarget.value = null
  draft.value = ''
  if (!props.song)
    return
  refreshCount().catch(() => {})
  await loadPage()
}

function changeSort(value: 'default' | 'latest') {
  if (sort.value === value)
    return
  sort.value = value
  comments.value = []
  page.value = 1
  finished.value = false
  loadPage()
}

async function loadReplies(item: CommentNode) {
  if (!props.song)
    return
  try {
    item.replies = await getSongComments({
      songId: props.song.id,
      parentId: item.id,
      pageSize: 50,
    })
    item.repliesLoaded = true
  } catch {
    item.repliesLoaded = true
  }
}

function startReply(item: SongComment) {
  openEditor(item)
}

/** 打开二级发送弹层；不传评论即为发布顶层评论 */
function openEditor(item: SongComment | null = null) {
  replyTarget.value = item
  editorVisible.value = true
  nextTick(() => {
    inputRef.value?.focus()
    autoGrow()
  })
}

function focusInput() {
  inputRef.value?.focus()
  autoGrow()
}

function onEditorClosed() {
  replyTarget.value = null
  emojiOpen.value = false
}

/** 直接删除自己的评论：连同其回复，按接口返回条数同步总数 */
async function onDelete(item: SongComment) {
  try {
    const { count } = await deleteSongComment(item.id)
    if (item.parentId) {
      const parent = comments.value.find(node => node.id === item.parentId)
      if (parent) {
        parent.replies = parent.replies.filter(reply => reply.id !== item.id)
        parent.replyCount = Math.max(0, parent.replyCount - 1)
      }
    } else {
      comments.value = comments.value.filter(node => node.id !== item.id)
    }
    emitCount(Math.max(0, total.value - count))
    showToast('已删除')
  } catch {
    /* 请求错误已由拦截器提示 */
  }
}

async function onLike(item: SongComment) {
  try {
    const { liked, likeCount } = await toggleCommentLike(item.id)
    item.liked = liked
    item.likeCount = likeCount
  } catch { /* 请求错误已由拦截器提示 */ }
}

async function submit() {
  const song = props.song
  const content = draft.value.trim()
  if (!song || !content || sending.value)
    return
  sending.value = true
  try {
    const created = await addSongComment({
      songId: song.id,
      content,
      parentId: replyTarget.value?.id ?? 0,
    })
    draft.value = ''
    emitCount(total.value + 1)
    const parent = created.parentId
      ? comments.value.find(item => item.id === created.parentId)
      : null
    if (parent) {
      parent.replies.push(created)
      parent.replyCount += 1
      parent.repliesLoaded = true
    } else {
      comments.value.unshift({ ...created, replies: [], repliesLoaded: false })
    }
    replyTarget.value = null
    emojiOpen.value = false
    editorVisible.value = false
    await nextTick()
    resetInputHeight()
    showToast('评论成功')
  } catch {
    /* 请求错误已由拦截器提示 */
  } finally {
    sending.value = false
  }
}

watch([() => visible.value, () => props.song?.id], ([show]) => {
  if (show) {
    reset()
  } else {
    editorVisible.value = false
  }
})

// ========== 下拉关闭：头部/拖拽条拖动，避免和评论列表滚动冲突 ==========
const CLOSE_DISTANCE = 80

function createDragClose(onClose: () => void) {
  const dragY = ref(0)
  const dragging = ref(false)
  let startY = 0

  return {
    style: computed(() => ({
      transform: `translate3d(0, ${dragY.value}px, 0)`,
      transition: dragging.value ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.35, 1)',
    })),
    handlers: {
      touchstart(event: TouchEvent) {
        const touch = event.touches[0]
        if (!touch)
          return
        startY = touch.clientY
        dragY.value = 0
        dragging.value = true
      },
      touchmove(event: TouchEvent) {
        if (!dragging.value)
          return
        const touch = event.touches[0]
        if (!touch)
          return
        const dy = touch.clientY - startY
        dragY.value = Math.max(0, dy)
        // 向下拖动时阻止页面级滚动，跟手更顺
        if (dy > 0 && event.cancelable)
          event.preventDefault()
      },
      touchend() {
        const shouldClose = dragging.value && dragY.value >= CLOSE_DISTANCE
        dragging.value = false
        dragY.value = 0
        if (shouldClose)
          onClose()
      },
      touchcancel() {
        dragging.value = false
        dragY.value = 0
      },
    },
  }
}

const mainDrag = createDragClose(() => {
  visible.value = false
})
const editorDrag = createDragClose(() => {
  editorVisible.value = false
})
</script>

<style lang="scss" scoped>
.comment-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.comment-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--theme-text, #fff);
  will-change: transform;
}

.comment-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.14);

  .head-icon {
    position: absolute;
    left: 16px;
    opacity: 0.85;
  }

  .head-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .head-sort {
    position: absolute;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .sort-btn {
    padding: 0;
    border: none;
    font-size: 13px;
    color: inherit;
    background: transparent;
    opacity: 0.55;
    cursor: pointer;

    &.active {
      font-weight: 500;
      opacity: 1;
    }
  }

  .sort-divider {
    opacity: 0.25;
  }
}

.comment-scroll {
  flex: 1;
  padding: 6px 16px calc(16px + env(safe-area-inset-bottom));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(128, 128, 128, 0.2);

  &.small {
    width: 28px;
    height: 28px;
  }
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.author {
  margin: 0 0 5px;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.55;
}

.content {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.5;

  .meta-btn {
    padding: 0;
    border: none;
    font-size: 12px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }

  .meta-btn:hover {
    opacity: 0.9;
  }
}

.like-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 4px 0 0 4px;
  border: none;
  font-size: 11px;
  color: inherit;
  background: transparent;
  opacity: 0.75;
  cursor: pointer;
}

.reply-list {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.12);
}

.reply-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  & + .reply-item {
    margin-top: 10px;
  }

  .author {
    font-size: 11px;
  }

  .content {
    font-size: 14px;
  }
}

.expand-btn {
  margin-top: 8px;
  padding: 0;
  border: none;
  font-size: 12px;
  color: #5b9dff;
  background: transparent;
  cursor: pointer;
}

.comment-tip {
  padding: 28px 0;
  font-size: 13px;
  text-align: center;
  opacity: 0.5;
}

.comment-input {
  flex-shrink: 0;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(128, 128, 128, 0.14);
  background: rgba(0, 0, 0, 0.18);
}

.input-trigger {
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 36px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: rgba(128, 128, 128, 0.16);
  opacity: 0.45;
  cursor: pointer;
}

.editor-popup {
  background: var(--theme-background, #1a1a1a) !important;
}

.editor-wrap {
  padding: 0 14px calc(14px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
  will-change: transform;
}

.editor-handle {
  display: flex;
  justify-content: center;
  padding: 8px 0 10px;
  cursor: grab;

  .handle-bar {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: rgba(128, 128, 128, 0.5);
  }
}

.input-box {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(128, 128, 128, 0.16);
}

.input-field {
  display: block;
  width: 100%;
  min-height: 22px;
  max-height: 108px;
  padding: 0;
  border: none;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.5;
  color: inherit;
  background: transparent;
  outline: none;
  resize: none;

  &::placeholder {
    color: inherit;
    opacity: 0.45;
  }
}

.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.tool-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.tool-icon {
  opacity: 0.8;
  cursor: pointer;

  &.active {
    color: #ff5c7c;
    opacity: 1;
  }
}

.send-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 20px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
  color: #111;
  background: #fff;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.emoji-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 132px;
  margin-top: 10px;
  overflow-y: auto;
}

.emoji-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 8px;
  font-size: 20px;
  line-height: 1;
  background: transparent;
  cursor: pointer;
}
</style>
