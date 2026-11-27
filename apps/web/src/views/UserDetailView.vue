<template>
  <div class="user-page">
    <header class="user-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">账号详情</span>
      <span class="header-spacer" />
    </header>

    <main class="user-main">
      <div v-if="loading" class="page-loading">
        <van-loading size="22" color="rgba(255, 255, 255, 0.6)" />
      </div>

      <template v-else-if="profile">
        <section class="profile-card">
          <button type="button" class="avatar-btn" @click="previewAvatar">
            <img class="avatar" :src="avatarSrc" alt="">
          </button>
          <div class="profile-name">
            <h1>{{ name }}</h1>
            <VipBadge :level="profile.vipLevel" />
          </div>

          <div class="stats">
            <div class="stat-item">
              <b>{{ profile.commentCount }}</b>
              <span>评论</span>
            </div>
            <div class="stat-item">
              <b>{{ profile.wishCount }}</b>
              <span>心愿</span>
            </div>
            <div class="stat-item">
              <b>{{ profile.playlistCount }}</b>
              <span>歌单</span>
            </div>
          </div>
        </section>

        <section class="message-card">
          <h2 class="card-title">
            {{ profile.mine ? '我的留言' : '给他留言' }}
          </h2>
          <template v-if="profile.mine">
            <p class="self-tip">
              这是你自己的账号，去「账号详情」修改资料吧
            </p>
            <button type="button" class="self-btn" @click="goAccount">
              前往账号详情
            </button>
          </template>
          <template v-else>
            <p class="self-tip">
              留言与回复都会保存在这里，随时可以查看
            </p>
            <button type="button" class="self-btn" @click="messageVisible = true">
              打开留言
            </button>
          </template>
        </section>

        <section
          v-if="profileStore.isAdmin && !profile.mine"
          class="message-card"
        >
          <h2 class="card-title">
            管理员操作
          </h2>
          <p class="self-tip">
            封禁后该用户将无法登录，解封请到用户管理
          </p>
          <button type="button" class="danger-btn" @click="banVisible = true">
            封禁该用户
          </button>
        </section>
      </template>

      <p v-else class="error-tip">
        用户信息加载失败
      </p>
    </main>

    <UserMessageSheet v-model:visible="messageVisible" :target="messageTarget" />
    <ImageViewer v-model:visible="avatarPreviewVisible" :src="avatarSrc" />

    <van-dialog
      v-model:show="banVisible"
      title="封禁用户"
      show-cancel-button
      :before-close="onBanConfirm"
    >
      <div class="ban-form">
        <div class="dur-row">
          <button
            v-for="opt in banOptions"
            :key="opt.days"
            type="button"
            class="dur-chip"
            :class="{ active: banForm.days === opt.days }"
            @click="banForm.days = opt.days"
          >
            {{ opt.label }}
          </button>
        </div>
        <textarea
          v-model="banForm.reason"
          class="ban-reason-input"
          rows="2"
          maxlength="100"
          placeholder="选填，让用户知道为什么被封"
        />
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import type { PublicUserProfile } from '@/api/user'
import { banUser } from '@/api/admin-user'
import { getPublicUserProfile } from '@/api/user'
import ImageViewer from '@/components/common/ImageViewer.vue'
import VipBadge from '@/components/common/VipBadge.vue'
import UserMessageSheet from '@/components/user/UserMessageSheet.vue'
import { useUserProfileStore } from '@/stores/userProfile'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { resolveDisplayName } from '@/utils/user-token'
import { showToast } from 'vant'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const profileStore = useUserProfileStore()

const profile = ref<PublicUserProfile | null>(null)
const loading = ref(true)
const avatarPreviewVisible = ref(false)
const messageVisible = ref(false)

const userId = computed(() => String(route.params.id ?? ''))
const name = computed(() => resolveDisplayName({
  nickname: profile.value?.nickname,
  userId: profile.value?.id,
}))
const avatarSrc = computed(() => resolveAvatarOrDefault(
  profile.value?.avatar,
  profile.value?.id ?? userId.value,
))

const messageTarget = computed(() => profile.value
  ? { id: profile.value.id, name: name.value, avatar: avatarSrc.value }
  : null)

async function load() {
  if (!userId.value)
    return
  loading.value = true
  try {
    profile.value = await getPublicUserProfile(userId.value)
  } catch {
    profile.value = null
  } finally {
    loading.value = false
  }
}

function previewAvatar() {
  if (avatarSrc.value)
    avatarPreviewVisible.value = true
}

function goAccount() {
  router.push('/account')
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}

/** 管理员封禁弹框 */
const banVisible = ref(false)
const banForm = ref({ reason: '', days: 0 })
/** 封禁时长选项，days = 0 永久 */
const banOptions = [
  { label: '永久', days: 0 },
  { label: '90 天', days: 90 },
  { label: '30 天', days: 30 },
  { label: '7 天', days: 7 },
]

async function onBanConfirm(action: string) {
  if (action !== 'confirm' || !profile.value)
    return true
  try {
    const { reason, days } = banForm.value
    await banUser(profile.value.id, reason.trim(), days)
    showToast(days > 0 ? `已封禁 ${days} 天` : '已永久封禁')
    banForm.value = { reason: '', days: 0 }
    return true
  } catch {
    return false
  }
}

watch(userId, () => {
  load()
}, { immediate: true })
</script>

<style scoped>
.user-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.user-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}

.user-header .back-btn,
.user-header .header-spacer {
  width: 34px;
  height: 34px;
}

.user-header .back-btn {
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

.user-header .header-title {
  font-size: 15px;
  opacity: 0.8;
}

.user-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: 24px 24px 36px;
  overflow-y: auto;
}

.page-loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
}

.avatar-btn {
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.avatar {
  display: block;
  width: 72px;
  height: 72px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.profile-name h1 {
  max-width: 200px;
  margin: 0;
  overflow: hidden;
  font-size: 18px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  display: flex;
  width: 100%;
  margin-top: 10px;
  padding: 12px 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.stat-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-item + .stat-item {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-item b {
  font-size: 16px;
  font-weight: 600;
}

.stat-item span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.message-card {
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.card-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
}

.self-tip {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.5;
}

.self-btn {
  width: 100%;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.danger-btn {
  width: 100%;
  height: 40px;
  border: 1px solid rgba(255, 92, 124, 0.45);
  border-radius: 12px;
  background: rgba(255, 92, 124, 0.14);
  color: #ff5c7c;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ban-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px;
}

.dur-row {
  display: flex;
  gap: 6px;
}

.dur-chip {
  flex: 1;
  padding: 6px 0;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
}

.dur-chip.active {
  border-color: #ff5c7c;
  background: rgba(255, 92, 124, 0.12);
  color: #ff5c7c;
}

.ban-reason-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  background: transparent;
  color: #333;
  font-family: inherit;
  font-size: 13px;
  resize: none;
  outline: none;
}

.error-tip {
  padding-top: 80px;
  text-align: center;
  font-size: 13px;
  opacity: 0.5;
}
</style>
