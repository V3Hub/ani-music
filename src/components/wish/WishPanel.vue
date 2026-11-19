<template>
  <div class="wish-panel">
    <div class="panel-header">
      <h1 class="panel-title">
        心愿墙
        <van-icon name="star-o" class="title-star" />
      </h1>
      <span class="panel-badge">最近 30 天</span>
    </div>
    <p class="panel-sub">
      把心愿挂上这面墙，等一颗流星替你实现
    </p>

    <!-- 每周只能许一个心愿：本周已许愿则展示提示 -->
    <section v-if="weeklyWish" class="weekly-lock">
      <van-icon name="star" class="lock-star" />
      <div class="lock-text">
        <p class="lock-title">
          本周心愿已挂上墙
        </p>
        <span class="lock-sub">{{ daysUntilNextWish }} 天后可以再次许愿</span>
      </div>
    </section>
    <section v-else class="compose" :class="{ focused }">
      <textarea
        v-model="draft"
        class="compose-input"
        maxlength="100"
        rows="2"
        placeholder="写下你的心愿，让它被星光看见…"
        @focus="focused = true"
        @blur="focused = false"
      />
      <div class="compose-foot">
        <div class="compose-tools">
          <span class="compose-count">{{ draft.length }}/100</span>
        </div>
        <button
          class="compose-submit"
          :disabled="!draft.trim() || posting"
          @click="submitWish"
        >
          <van-icon name="star" />
          {{ posting ? '许愿中…' : '挂上心愿墙' }}
        </button>
      </div>
    </section>

    <van-loading v-if="loading" class="wish-loading" color="#f0abfc" />

    <template v-else>
      <!-- 点赞 TOP3 固定展示 -->
      <section v-if="topWishes.length" class="section">
        <div class="section-head">
          <span class="section-title">星愿榜</span>
          <span class="section-hint">点赞 TOP3 · 常驻</span>
        </div>
        <div class="top-list">
          <article
            v-for="(wish, index) in topWishes"
            :key="wish.id"
            class="top-row"
            :class="`rank-${index + 1}`"
            :style="{ animationDelay: `${index * 90}ms` }"
            @click="openDetail(wish)"
          >
            <span class="rank-flag">{{ index + 1 }}</span>
            <img class="avatar clickable" :src="wishAvatarUrl(wish.userId, wish.avatar)" alt="" @click.stop="openUserProfile(wish.userId)">
            <div class="top-main">
              <p class="top-content">
                {{ wish.content }}
              </p>
              <span class="wish-user clickable" @click.stop="openUserProfile(wish.userId)">
                {{ wishUserName(wish.userId, wish.nickname) }}
                <VipBadge :level="wish.vipLevel" small />
                <i v-if="wish.mine" class="mine-inline">我的</i>
              </span>
            </div>
            <div class="top-actions">
              <button
                class="action like"
                :class="{ liked: wish.liked }"
                @click.stop="handleLike(wish)"
              >
                <van-icon :name="wish.liked ? 'liked' : 'like-o'" />
                <span>{{ wish.likeCount }}</span>
              </button>
              <button class="action" @click.stop="openDetail(wish)">
                <van-icon name="comment-o" />
                <span>{{ wish.messageCount }}</span>
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- 其余心愿轮动 -->
      <section v-if="currentWish" class="section">
        <div class="section-head">
          <span class="section-title">心愿流转</span>
          <span class="section-hint">左右滑动切换</span>
        </div>
        <div
          class="carousel"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <transition name="wish-slide" mode="out-in">
            <article
              :key="currentWish.id"
              class="wish-card carousel-card"
              @click="openDetail(currentWish)"
            >
              <span v-if="currentWish.mine" class="mine-tag">我的</span>
              <p class="wish-content">
                {{ currentWish.content }}
              </p>
              <div class="wish-meta">
                <img class="avatar clickable" :src="wishAvatarUrl(currentWish.userId, currentWish.avatar)" alt="" @click.stop="openUserProfile(currentWish.userId)">
                <span class="wish-user clickable" @click.stop="openUserProfile(currentWish.userId)">
                  {{ wishUserName(currentWish.userId, currentWish.nickname) }}
                  <VipBadge :level="currentWish.vipLevel" small />
                </span>
                <span class="wish-time">{{ formatWishTime(currentWish.createTime) }}</span>
                <div class="wish-actions">
                  <button
                    class="action like"
                    :class="{ liked: currentWish.liked }"
                    @click.stop="handleLike(currentWish)"
                  >
                    <van-icon :name="currentWish.liked ? 'liked' : 'like-o'" />
                    <span>{{ currentWish.likeCount }}</span>
                  </button>
                  <button class="action" @click.stop="openDetail(currentWish)">
                    <van-icon name="comment-o" />
                    <span>{{ currentWish.messageCount }}</span>
                  </button>
                </div>
              </div>
            </article>
          </transition>
        </div>
        <div class="rotate-progress">
          <span :style="{ width: `${rotatePercent}%` }" />
        </div>
      </section>

      <div v-if="!wishes.length" class="empty">
        <span class="empty-icon">✦</span>
        <p>还没有人许愿，成为第一个吧</p>
      </div>
    </template>

    <WishDetailPopup
      v-model:visible="detailVisible"
      :wish="activeWish"
      @change="handleDetailChange"
      @deleted="handleWishDeleted"
      @closed="resumeRotate"
    />
  </div>
</template>

<script setup lang="ts">
import type { Wish } from '@/types/wish'
import { addWish, getWishes, toggleWishLike } from '@/api/wish'
import { formatWishTime, wishAvatarUrl, wishUserName } from '@/utils/wish'
import VipBadge from '@/components/common/VipBadge.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WishDetailPopup from './WishDetailPopup.vue'

const ROTATE_INTERVAL = 4500
/** 同一用户两次许愿的最短间隔：7 天 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const wishes = ref<Wish[]>([])
const loading = ref(true)
const posting = ref(false)
const draft = ref('')
const focused = ref(false)
const rotateIndex = ref(0)
const detailVisible = ref(false)
const activeWish = ref<Wish | null>(null)

const router = useRouter()

/** 查看用户资料并留言：跳转到账号详情页 */
function openUserProfile(userId: string | number) {
  if (!userId)
    return
  router.push(`/user/${userId}`)
}

let rotateTimer: ReturnType<typeof setInterval> | undefined
let touchStartX = 0
/** 正在请求中的点赞，避免连点导致状态错乱 */
const pendingLikes = new Set<number>()

/** 点赞最多的三条固定展示 */
const topWishes = computed(() => wishes.value.slice(0, 3))
/** 其余心愿参与轮动 */
const rotatingWishes = computed(() => wishes.value.slice(3))
const rotatePointer = computed(() => {
  const len = rotatingWishes.value.length
  return len ? rotateIndex.value % len : 0
})
const currentWish = computed(() => rotatingWishes.value[rotatePointer.value] ?? null)
const rotatePercent = computed(() => {
  const len = rotatingWishes.value.length
  return len ? ((rotatePointer.value + 1) / len) * 100 : 0
})

/** 本周（7 天内）已许过的心愿：有则锁定发表入口 */
const weeklyWish = computed(() => {
  const cutoff = Date.now() - WEEK_MS
  return wishes.value.find(item => item.mine && item.createTime > cutoff) ?? null
})
const daysUntilNextWish = computed(() => {
  if (!weeklyWish.value) return 0
  const remain = weeklyWish.value.createTime + WEEK_MS - Date.now()
  return Math.max(1, Math.ceil(remain / DAY_MS))
})

function sortWishes() {
  wishes.value = [...wishes.value].sort((a, b) => b.likeCount - a.likeCount || b.createTime - a.createTime)
}

async function loadWishes() {
  loading.value = true
  try {
    wishes.value = await getWishes()
  } catch {
    wishes.value = []
  } finally {
    loading.value = false
  }
}

function pauseRotate() {
  if (rotateTimer) {
    clearInterval(rotateTimer)
    rotateTimer = undefined
  }
}

function move(step: number) {
  const len = rotatingWishes.value.length
  if (!len) return
  rotateIndex.value = (rotateIndex.value + step + len) % len
}

function resumeRotate() {
  pauseRotate()
  if (rotatingWishes.value.length > 1) {
    rotateTimer = setInterval(move, ROTATE_INTERVAL, 1)
  }
}

function onTouchStart(event: TouchEvent) {
  pauseRotate()
  touchStartX = event.touches[0]?.clientX ?? 0
}

function onTouchEnd(event: TouchEvent) {
  const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX
  if (Math.abs(delta) > 40) {
    move(delta > 0 ? -1 : 1)
  }
  resumeRotate()
}

async function submitWish() {
  const content = draft.value.trim()
  if (!content || posting.value)
    return
  posting.value = true
  try {
    const wish = await addWish(content)
    wishes.value = [wish, ...wishes.value]
    sortWishes()
    draft.value = ''
    rotateIndex.value = 0
    resumeRotate()
  } finally {
    posting.value = false
  }
}

async function handleLike(wish: Wish) {
  // 点赞请求进行中时忽略重复点击，避免乐观更新被连点打乱
  if (pendingLikes.has(wish.id)) return
  pendingLikes.add(wish.id)

  // 先更新界面，再同步服务端；失败时回滚
  const prevLiked = wish.liked
  const prevCount = wish.likeCount
  const nextLiked = !prevLiked
  const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1))
  wish.liked = nextLiked
  wish.likeCount = nextCount
  pauseRotate()

  try {
    const result = await toggleWishLike(wish.id)
    wish.liked = result.liked
    wish.likeCount = result.likeCount
    sortWishes()
  } catch {
    wish.liked = prevLiked
    wish.likeCount = prevCount
  } finally {
    pendingLikes.delete(wish.id)
    resumeRotate()
  }
}

function openDetail(wish: Wish) {
  pauseRotate()
  activeWish.value = wish
  detailVisible.value = true
}

/** 管理员删除心愿后从列表移除 */
function handleWishDeleted(id: number) {
  wishes.value = wishes.value.filter(item => item.id !== id)
  activeWish.value = null
}

function handleDetailChange(payload: {
  id: number
  liked?: boolean
  likeCount?: number
  messageCount?: number
}) {
  const target = wishes.value.find(item => item.id === payload.id)
  if (!target)
    return
  if (payload.liked !== undefined) target.liked = payload.liked
  if (payload.likeCount !== undefined) target.likeCount = payload.likeCount
  if (payload.messageCount !== undefined) target.messageCount = payload.messageCount
  sortWishes()
}

onMounted(async () => {
  await loadWishes()
  resumeRotate()
})

onBeforeUnmount(pauseRotate)
</script>

<style scoped>
.wish-panel {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: calc(16px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  color: var(--theme-text, #fff);
  font-size: 14px;
  line-height: 1.5;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  font-weight: 800;
  letter-spacing: 0.6px;
  color: #fff;
}

.title-star {
  font-size: 16px;
  color: #fde68a;
  animation: star-pulse 2.4s ease-in-out infinite;
}

@keyframes star-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.15) rotate(12deg);
  }
}

.panel-badge {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.panel-sub {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.compose {
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.compose.focused {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.08),
    0 14px 34px rgba(0, 0, 0, 0.28);
}

.weekly-lock {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
}

.lock-star {
  flex-shrink: 0;
  font-size: 26px;
  color: #fde68a;
  filter: drop-shadow(0 0 10px rgba(253, 230, 138, 0.55));
  animation: star-pulse 2.4s ease-in-out infinite;
}

.lock-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lock-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.lock-sub {
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

.compose-input {
  display: block;
  width: 100%;
  min-height: 46px;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
}

.compose-input::placeholder {
  color: rgba(255, 255, 255, 0.38);
}

.compose-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.compose-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compose-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.compose-submit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 16px;
  border: 0;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease,
    background-color 0.2s ease;
}

.compose-submit:not(:disabled):active {
  background: rgba(255, 255, 255, 0.28);
}

.compose-submit:disabled {
  opacity: 0.4;
  box-shadow: none;
  cursor: not-allowed;
}

.compose-submit:not(:disabled):active {
  transform: scale(0.95);
}

.wish-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.section {
  margin-top: 18px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 9px;
}

.section-title {
  position: relative;
  padding-left: 12px;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
}

.section-title::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 13px;
  margin-top: -6.5px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.55);
}

.section-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* TOP3 榜单行：单行摘要，控制高度，避免把心愿流转挤出首屏 */
.top-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px 11px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  animation: card-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    background-color 0.25s ease;
}

.top-row:active {
  transform: scale(0.99);
  background: rgba(255, 255, 255, 0.08);
}

.top-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.top-content {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.45;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.top-actions {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}

.mine-inline {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 9px;
  font-style: normal;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.12);
}

.wish-card {
  position: relative;
  padding: 12px 14px 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
  animation: card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    background-color 0.25s ease;
}

.wish-card:active {
  transform: scale(0.985);
  background: rgba(255, 255, 255, 0.08);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.top-row.rank-1 {
  border-color: rgba(253, 224, 71, 0.5);
  box-shadow:
    0 8px 22px rgba(250, 204, 21, 0.16),
    inset 0 0 20px rgba(253, 224, 71, 0.07);
}

.top-row.rank-2 {
  border-color: rgba(226, 232, 240, 0.4);
  box-shadow: 0 8px 20px rgba(203, 213, 225, 0.12);
}

.top-row.rank-3 {
  border-color: rgba(251, 191, 146, 0.4);
  box-shadow: 0 8px 20px rgba(244, 162, 97, 0.14);
}

.rank-flag {
  position: absolute;
  top: -6px;
  left: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
  font-style: italic;
  color: #2b1a05;
  background: linear-gradient(135deg, #fde68a, #f59e0b);
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    0 3px 10px rgba(245, 158, 11, 0.5),
    0 0 12px rgba(253, 230, 138, 0.35);
}

.rank-2 .rank-flag {
  color: #1f2937;
  background: linear-gradient(135deg, #f8fafc, #cbd5e1);
  box-shadow: 0 6px 14px rgba(203, 213, 225, 0.35);
}

.rank-3 .rank-flag {
  color: #331a08;
  background: linear-gradient(135deg, #fed7aa, #f4a261);
  box-shadow: 0 6px 14px rgba(244, 162, 97, 0.4);
}

.mine-tag {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.wish-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.wish-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
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

  &.clickable {
    cursor: pointer;
  }
}

.wish-user {
  overflow: hidden;
  min-width: 0;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.66);
  text-overflow: ellipsis;
  white-space: nowrap;

  &.clickable {
    cursor: pointer;
  }
}

.wish-time {
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.wish-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.action:active {
  transform: scale(0.9);
}

.action.liked {
  color: #fb7185;
  text-shadow: 0 0 10px rgba(251, 113, 133, 0.65);
}

.action.liked :deep(.van-icon) {
  animation: heart-beat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes heart-beat {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.35);
  }
  70% {
    transform: scale(0.92);
  }
  100% {
    transform: scale(1);
  }
}

.carousel {
  position: relative;
  min-height: 118px;
}

.carousel-card {
  position: relative;
  overflow: hidden;
}

/* 轮动卡最多三行，配合紧凑信息行，保证心愿流转在首屏可见 */
.carousel-card .wish-content {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.carousel-card::after {
  display: none;
}

@keyframes halo {
  from {
    opacity: 0.35;
    transform: scale(0.9);
  }
  to {
    opacity: 0.75;
    transform: scale(1.15);
  }
}

.wish-slide-enter-active,
.wish-slide-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.wish-slide-enter-from {
  opacity: 0;
  transform: translateY(26px) scale(0.96);
}

.wish-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
}

.rotate-progress {
  height: 3px;
  margin-top: 10px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.rotate-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.5);
  transition: width 0.45s ease;
}

.empty {
  padding: 48px 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.empty-icon {
  display: block;
  margin-bottom: 8px;
  font-size: 32px;
  color: rgba(255, 255, 255, 0.5);
  animation: star-pulse 2.4s ease-in-out infinite;
}
</style>
