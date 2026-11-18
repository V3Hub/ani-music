<template>
  <div class="account-page">
    <header class="account-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">账号详情</span>
      <button type="button" class="edit-btn" @click="openEdit">
        编辑
      </button>
    </header>

    <main class="account-main">
      <section class="profile-card">
        <img class="avatar" :src="avatarSrc" alt="">
        <div class="profile-name">
          <h1>{{ displayName }}</h1>
          <VipBadge :level="profileStore.vipLevel" />
        </div>
        <p class="username">
          @{{ profileStore.username || '未设置' }}
        </p>
        <span class="vip-tip" :class="{ active: profileStore.vipLevel > 0 }">
          {{ vipText }}
        </span>
      </section>

      <section class="info-card">
        <h2 class="card-title">
          账号信息
        </h2>
        <ul class="info-list">
          <li class="info-item">
            <span class="info-label">用户名</span>
            <span class="info-value">{{ profileStore.username || '未设置' }}</span>
          </li>
          <li class="info-item">
            <span class="info-label">昵称</span>
            <span class="info-value">{{ profileStore.nickname || '未设置' }}</span>
          </li>
          <li class="info-item">
            <span class="info-label">会员状态</span>
            <span class="info-value">{{ vipText }}</span>
          </li>
        </ul>
      </section>
    </main>

    <!-- 编辑资料 -->
    <van-popup
      v-model:show="editVisible"
      position="bottom"
      round
      teleport="body"
      class="edit-sheet"
    >
      <div class="edit-wrap">
        <div class="edit-title">
          编辑资料
        </div>

        <div class="edit-avatar-row">
          <img class="edit-avatar" :src="editAvatarSrc" alt="">
          <button type="button" class="avatar-pick" @click="fileInput?.click()">
            更换头像
          </button>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept="image/*"
            @change="onPickAvatar"
          >
        </div>

        <label class="edit-field">
          <span class="edit-label">昵称</span>
          <input
            v-model="editNickname"
            type="text"
            maxlength="20"
            placeholder="请输入昵称"
          >
        </label>
        <label class="edit-field">
          <span class="edit-label">用户名</span>
          <input
            v-model="editUsername"
            type="text"
            maxlength="20"
            placeholder="2-20 个字符"
          >
        </label>

        <button type="button" class="edit-save" :disabled="saving" @click="saveProfile">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { updateUserProfile } from '@/api/user'
import VipBadge from '@/components/common/VipBadge.vue'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserProfileStore } from '@/stores/userProfile'
import { useUserStore } from '@/stores/user'
import { resolveAvatar } from '@/utils/avatar'
import { compressImageFile } from '@/utils/image'
import { showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const profileStore = useUserProfileStore()

const displayName = computed(() => profileStore.nickname || profileStore.username || '游客')
const avatarSrc = computed(() => resolveAvatar(
  profileStore.avatar,
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileStore.username || profileStore.id || 'guest'}`,
))
const vipText = computed(() => (
  profileStore.vipLevel > 0 ? `永久 VIP${profileStore.vipLevel}` : '普通用户'
))

const editVisible = ref(false)
const editUsername = ref('')
const editNickname = ref('')
const editAvatar = ref('')
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const editAvatarSrc = computed(() => resolveAvatar(
  editAvatar.value,
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(editUsername.value || String(profileStore.id))}`,
))

function openEdit() {
  editUsername.value = profileStore.username
  editNickname.value = profileStore.nickname
  editAvatar.value = profileStore.avatar
  editVisible.value = true
}

/** 头像压缩到最长边 256px 的 JPEG，控制 D1 单行大小 */
async function onPickAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  try {
    editAvatar.value = await compressImageFile(file, 256, 0.8)
  } catch {
    showToast('图片读取失败，请换一张试试')
  } finally {
    ;(event.target as HTMLInputElement).value = ''
  }
}

async function saveProfile() {
  if (saving.value)
    return
  const nickname = editNickname.value.trim()
  const username = editUsername.value.trim()
  if (!nickname) {
    showToast('请输入昵称')
    return
  }
  if (username.length < 2 || username.length > 20) {
    showToast('用户名需 2-20 个字符')
    return
  }
  saving.value = true
  try {
    const profile = await updateUserProfile({
      username,
      nickname,
      avatar: editAvatar.value,
    })
    profileStore.applyProfile(profile)
    // 同步本地历史账号，切换账号弹层里的信息一并更新
    const token = userStore.getToken()
    if (token)
      userStore.saveAccount(profile, token)
    editVisible.value = false
    showToast('已保存')
  } catch {
    // 错误提示由拦截器处理
  } finally {
    saving.value = false
  }
}

/** 返回首页时切回「我的」页 */
function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}

onMounted(async () => {
  // 游客也有 token，但没有用户名，此时按未登录处理
  await profileStore.fetchProfile()
  if (!profileStore.username)
    router.replace('/login')
})
</script>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.account-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(10px + env(safe-area-inset-top)) 14px 0;
}

.account-header .back-btn,
.account-header .edit-btn {
  width: 34px;
  height: 34px;
}

.account-header .edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.account-header .back-btn {
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

.account-header .header-title {
  font-size: 15px;
  opacity: 0.8;
}

.account-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: 24px 24px calc(36px + env(safe-area-inset-bottom));
  overflow-y: auto;
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

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-name h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.username {
  margin: 0;
  font-size: 12px;
  opacity: 0.45;
}

.vip-tip {
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  opacity: 0.6;
}

.vip-tip.active {
  border-color: rgba(244, 200, 120, 0.5);
  background: rgba(244, 200, 120, 0.14);
  color: #f6d695;
  opacity: 1;
}

.info-card {
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

.info-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.info-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  font-size: 13px;
}

.info-item + .info-item {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.info-label {
  color: rgba(255, 255, 255, 0.55);
}

.info-value {
  text-align: right;
  color: rgba(255, 255, 255, 0.82);
}

/* 编辑资料弹层 */
.edit-sheet {
  background: var(--popup-bg-raised, #1b1b24);
}

.edit-wrap {
  padding: 4px 20px calc(20px + env(safe-area-inset-bottom));
  color: #fff;
}

.edit-title {
  padding: 16px 0;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
}

.edit-avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.edit-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  object-fit: cover;
}

.avatar-pick {
  padding: 7px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.file-input {
  display: none;
}

.edit-field {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  margin-bottom: 12px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}

.edit-label {
  flex-shrink: 0;
  font-size: 13px;
  opacity: 0.55;
}

.edit-field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-size: 14px;
}

.edit-field input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.edit-save {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
