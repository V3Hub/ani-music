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
      </template>

      <p v-else class="error-tip">
        用户信息加载失败
      </p>
    </main>

    <UserMessageSheet v-model:visible="messageVisible" :target="messageTarget" />
    <ImageViewer v-model:visible="avatarPreviewVisible" :src="avatarSrc" />
  </div>
</template>

<script setup lang="ts">
import type { PublicUserProfile } from '@/api/user'
import { getPublicUserProfile } from '@/api/user'
import ImageViewer from '@/components/common/ImageViewer.vue'
import VipBadge from '@/components/common/VipBadge.vue'
import UserMessageSheet from '@/components/user/UserMessageSheet.vue'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { resolveDisplayName } from '@/utils/user-token'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

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

.error-tip {
  padding-top: 80px;
  text-align: center;
  font-size: 13px;
  opacity: 0.5;
}
</style>
