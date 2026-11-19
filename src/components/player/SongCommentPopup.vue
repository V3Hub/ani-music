<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    teleport="body"
    class="comment-popup"
    @closed="mainDrag.reset"
  >
    <div class="comment-wrap" :style="mainDrag.style.value">
      <header
        class="comment-head"
        v-on="mainDrag.handlers"
        @click="onHeaderClick"
      >
        <span class="grab" />
        <h3 class="head-title">
          评论<template v-if="total"> ({{ total }})</template>
        </h3>
        <van-icon name="cross" class="head-close" @click.stop="visible = false" />
      </header>

      <div class="comment-sort">
        <button
          type="button"
          class="sort-btn"
          :class="{ active: sort === 'default' }"
          @click.stop="changeSort('default')"
        >
          默认
        </button>
        <span class="sort-divider">|</span>
        <button
          type="button"
          class="sort-btn"
          :class="{ active: sort === 'latest' }"
          @click.stop="changeSort('latest')"
        >
          最新
        </button>
      </div>

      <div class="comment-scroll" @scroll="onScroll">
        <div v-for="item in comments" :key="item.id" class="comment-item">
          <img class="avatar clickable" :src="avatarOf(item)" alt="" @click="openUserProfile(item.userId)">
          <div class="comment-main">
            <p class="author clickable" @click="openUserProfile(item.userId)">
              {{ displayName(item) }}
              <VipBadge :level="item.vipLevel" small />
            </p>
            <p class="content">
              {{ item.content }}
            </p>
            <div class="meta">
              <span class="meta-time">{{ formatTime(item.createTime) }}</span>
              <button type="button" class="meta-btn" @click="startReply(item)">
                回复
              </button>
              <button v-if="item.mine || profileStore.isAdmin" type="button" class="meta-btn" @click="onDelete(item)">
                删除
              </button>
            </div>

            <div v-if="item.replies.length" class="reply-list">
              <div v-for="reply in item.replies" :key="reply.id" class="reply-item">
                <img class="avatar small clickable" :src="avatarOf(reply)" alt="" @click="openUserProfile(reply.userId)">
                <div class="comment-main">
                  <p class="author clickable" @click="openUserProfile(reply.userId)">
                    {{ displayName(reply) }}
                    <VipBadge :level="reply.vipLevel" small />
                  </p>
                  <p class="content">
                    {{ reply.content }}
                  </p>
                  <div class="meta">
                    <span class="meta-time">{{ formatTime(reply.createTime) }}</span>
                    <button type="button" class="meta-btn" @click="startReply(reply)">
                      回复
                    </button>
                    <button v-if="reply.mine || profileStore.isAdmin" type="button" class="meta-btn" @click="onDelete(reply)">
                      删除
                    </button>
                  </div>
                </div>
                <button type="button" class="like-btn" @click="onLike(reply)">
                  <van-icon
                    :name="reply.liked ? 'like' : 'like-o'"
                    :color="reply.liked ? '#FF5C7C' : 'rgba(255,255,255,0.6)'"
                    size="13"
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
              size="14"
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
        <button type="button" class="foot-trigger" @click="openEditor()">
          <van-icon name="edit" />
          <span>{{ replyTarget ? `回复 @${displayName(replyTarget)}` : '喊上朋友来听这首歌' }}</span>
        </button>
      </footer>
    </div>
  </van-popup>

  <!-- 二级弹层：点击输入框后弹出，样式与心愿留言一致 -->
  <van-popup
    v-model:show="editorVisible"
    position="bottom"
    round
    teleport="body"
    class="editor-popup"
    @opened="focusInput"
    @closed="onEditorClosed"
  >
    <div class="editor-wrap">
      <div class="editor-head">
        <span class="editor-title">{{ replyTarget ? '写下回复' : '写下评论' }}</span>
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
        :placeholder="replyTarget ? `回复 @${displayName(replyTarget)}` : '喊上朋友来听这首歌'"
      />
      <div class="editor-foot">
        <div class="editor-tools">
          <span class="editor-count">{{ draft.length }}/500</span>
        </div>
        <button
          type="button"
          class="editor-send"
          :disabled="!draft.trim() || sending"
          @click="submit"
        >
          {{ sending ? '发送中' : '发送' }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Song, SongComment } from '@/types/music'
import { addSongComment, deleteSongComment, getSongCommentCount, getSongComments, toggleCommentLike } from '@/api/music'
import { resolveDisplayName } from '@/utils/user-token'
import { useUserProfileStore } from '@/stores/userProfile'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import VipBadge from '@/components/common/VipBadge.vue'
import { showToast } from 'vant'
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

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

/** 管理员可删除任意评论 */
const profileStore = useUserProfileStore()
const router = useRouter()

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
const editorVisible = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)

/** 查看用户资料并留言：跳转到账号详情页 */
function openUserProfile(userId: string | number) {
  if (!userId)
    return
  router.push(`/user/${userId}`)
}

/** 有真实头像用真实头像，否则用 DiceBear（seed 为 userId） */
function avatarOf(comment: SongComment) {
  return resolveAvatarOrDefault(comment.avatar, comment.userId)
}

function displayName(comment: SongComment) {
  return resolveDisplayName({
    nickname: comment.nickname,
    userId: comment.userId,
  })
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
}

function focusInput() {
  inputRef.value?.focus()
}

function onEditorClosed() {
  replyTarget.value = null
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
    editorVisible.value = false
    await nextTick()
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
  /** 本次交互是否发生了拖动：拖动松手后的 click 不当作“点击关闭” */
  let dragged = false

  /** 关闭动画结束后复位位移：无过渡瞬间归零，避免下次打开残留偏移 */
  function reset() {
    dragY.value = 0
    requestAnimationFrame(() => {
      dragging.value = false
    })
  }

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
        dragged = false
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
        if (dragY.value > 6)
          dragged = true
        // 向下拖动时阻止页面级滚动，跟手更顺
        if (dy > 0 && event.cancelable)
          event.preventDefault()
      },
      touchend() {
        if (dragging.value && dragY.value >= CLOSE_DISTANCE) {
          // 保持拖出位置直接关闭，让弹层顺势继续下滑，避免先回弹再关闭的抖动
          onClose()
          return
        }
        dragging.value = false
        dragY.value = 0
      },
      touchcancel() {
        dragging.value = false
        dragY.value = 0
      },
    },
    reset,
    /** 上一次按下后是否发生了拖动（用于避免拖动结束误触发点击关闭） */
    wasDragged: () => dragged,
  }
}

const mainDrag = createDragClose(() => {
  visible.value = false
})

/** 点击顶部标题栏关闭：电脑端没有触摸手势时也能关掉弹层 */
function onHeaderClick() {
  if (mainDrag.wasDragged())
    return
  visible.value = false
}
</script>

<style lang="scss" scoped>
.comment-popup {
  height: 74%;
  // 背景交给内容层：下拉拖动时背景跟内容一起移动
  background: transparent !important;
}

.comment-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--theme-text, #fff);
  background: var(--popup-bg);
  border-radius: inherit;
  will-change: transform;
}

.comment-head {
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

.comment-sort {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 18px 8px;
  font-size: 12px;
}

.sort-btn {
  padding: 0;
  border: none;
  font-size: 12px;
  color: inherit;
  background: transparent;
  opacity: 0.55;
  cursor: pointer;

  &.active {
    font-weight: 600;
    opacity: 1;
  }
}

.sort-divider {
  opacity: 0.25;
}

.comment-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 14px 8px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.24);

  & + .comment-item {
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

  &.clickable {
    cursor: pointer;
  }
}

.comment-main {
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

  &.clickable {
    cursor: pointer;
  }
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

  .meta-btn {
    padding: 0;
    border: none;
    font-size: 10px;
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
  gap: 1px;
  flex-shrink: 0;
  padding: 1px 0 0 2px;
  border: none;
  font-size: 9px;
  color: inherit;
  background: transparent;
  opacity: 0.75;
  cursor: pointer;
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

.expand-btn {
  margin-top: 5px;
  padding: 0;
  border: none;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
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
  text-align: left;
  cursor: text;
  overflow: hidden;

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.foot-trigger:active {
  background: rgba(255, 255, 255, 0.12);
}

.editor-popup {
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
  transform: scale(0.96);
}

.editor-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
