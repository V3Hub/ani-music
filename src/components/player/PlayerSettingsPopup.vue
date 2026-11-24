<template>
  <van-popup
    v-model:show="visible"
    position="right"
    :style="{ width: '100%', height: '100%' }"
    class="settings-popup"
    @closed="onClosed"
  >
    <div class="settings-wrap" :style="swipeStyle" v-on="handlers">
      <div class="settings-header">
        <van-icon name="arrow-left" size="20" class="close-icon" @click="visible = false" />
        <div class="header-title">设置</div>
      </div>

      <div class="settings-body">
        <!-- 播放设置 -->
        <section class="settings-section">
          <div class="section-title">播放设置</div>
          <ul class="section-list">
            <li class="section-item" @click="openSourcePicker">
              <span class="item-label">播放源</span>
              <span class="item-value">
                {{ sourceLabel }}
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="sleepVisible = true">
              <span class="item-label">定时关闭</span>
              <span class="item-value">
                <span class="item-status">{{ sleepLabel }}</span>
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
          </ul>
        </section>

        <!-- 账号：退出登录后仍保留历史账号，可在这里切换或删除 -->
        <section v-if="loggedIn || hasAccounts" class="settings-section">
          <div class="section-title">账号</div>
          <ul class="section-list">
            <li v-if="hasSwitchable" class="section-item" @click="switchVisible = true">
              <span class="item-label">切换账号</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li v-if="loggedIn" class="section-item" @click="emit('logout')">
              <span class="item-label item-danger">退出登录</span>
            </li>
          </ul>
        </section>

        <!-- 管理 -->
        <section v-if="isAdmin" class="settings-section">
          <div class="section-title">管理</div>
          <ul class="section-list">
            <li class="section-item" @click="emit('adminReview')">
              <span class="item-label">注册审批</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="emit('adminErrorLogs')">
              <span class="item-label">错误日志</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="emit('adminSongTags')">
              <span class="item-label">歌曲标签</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="emit('adminMessages')">
              <span class="item-label">用户留言</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
          </ul>
        </section>

        <!-- 应用下载：按应用商店的安装卡片展示 -->
        <section v-if="mobilePlatform !== 'other'" class="settings-section">
          <div class="section-title">应用</div>
          <div class="app-card">
            <div class="app-icon">
              <img src="/qs.svg" alt="Ani 音乐">
            </div>
            <div class="app-info">
              <div class="app-name">
                Ani 音乐
                <span class="app-tag">轻量版</span>
              </div>
              <div class="app-meta">
                v{{ appVersion }}
              </div>
            </div>
            <button type="button" class="app-install" @click="onDownloadApp">
              下载
            </button>
          </div>
        </section>

        <!-- 其他 -->
        <section class="settings-section">
          <div class="section-title">其他</div>
          <ul class="section-list">
            <li class="section-item" @click="emit('contactAdmin')">
              <span class="item-label">联系管理员</span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="emit('about')">
              <span class="item-label">
                关于
                <span v-if="hasUpdate" class="update-dot" />
              </span>
              <span class="item-value">
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- 播放源选择器（bottom sheet，和定时关闭同风格） -->
    <van-popup v-model:show="pickerVisible" position="bottom" round>
      <div class="source-sheet">
        <div class="sheet-title">选择播放源</div>
        <div class="source-options">
          <button
            v-for="opt in sourceOptions"
            :key="opt.value"
            type="button"
            class="source-btn"
            :class="{ 'is-active': opt.value === currentSource }"
            @click="onPickSource(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="source-sheet-hint">切换播放源后，搜索将使用该音源</div>
      </div>
    </van-popup>

    <!-- 切换账号 -->
    <van-popup v-model:show="switchVisible" position="bottom" round>
      <div class="switch-sheet">
        <div class="sheet-title">切换账号</div>
        <ul class="switch-list">
          <li
            v-for="acc in accounts"
            :key="acc.userId"
            class="switch-item"
            :class="{ current: acc.userId === currentUserId }"
            @click="onSwitchAccount(acc)"
          >
            <img class="switch-avatar" :src="accountAvatar(acc)" alt="">
            <div class="switch-meta">
              <span class="switch-name">{{ acc.nickname || acc.username }}</span>
              <span class="switch-username">@{{ acc.username }}</span>
            </div>
            <span v-if="acc.userId === currentUserId" class="switch-tag">当前</span>
            <van-icon v-else name="arrow" class="switch-arrow" />
            <button type="button" class="switch-del" @click.stop="onRemoveAccount(acc)">
              <van-icon name="delete-o" size="16" />
            </button>
          </li>
        </ul>
        <p v-if="!accounts.length" class="switch-empty">
          暂无历史账号
        </p>
      </div>
    </van-popup>

    <!-- 定时关闭选择器 -->
    <van-popup v-model:show="sleepVisible" position="bottom" round>
      <div class="sleep-sheet">
        <div class="sheet-title">定时关闭</div>
        <div class="sleep-options">
          <button
            v-for="opt in SLEEP_OPTIONS"
            :key="opt"
            type="button"
            class="sleep-btn"
            :class="{ 'is-active': opt === sleepMinutes }"
            @click="onPickSleep(opt)"
          >
            {{ opt === 0 ? '关闭' : `${opt} 分钟后停止` }}
          </button>
        </div>
      </div>
    </van-popup>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaybackSourceOption } from '@/constants/player-ui'
import type { SavedAccount } from '@/types/user'
import { SLEEP_OPTIONS } from '@/composables/player/usePlaybackSource'
import { useSwipeClose } from '@/composables/useSwipeClose'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { detectMobilePlatform, downloadWebClipProfile } from '@/utils/lite-app'
import { showConfirmDialog, showToast } from 'vant'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  sourceLabel: string
  sourceOptions: PlaybackSourceOption[]
  currentSource: string
  sleepLabel: string
  sleepMinutes: number
  /** 是否已登录（未登录不展示账号设置） */
  loggedIn: boolean
  /** 是否管理员（展示注册审批入口） */
  isAdmin?: boolean
  /** 本地保存的历史登录账号 */
  accounts: SavedAccount[]
  /** 当前登录用户 id，用于标记「当前」账号 */
  currentUserId?: number
}>()

const emit = defineEmits<{
  (e: 'confirmSource', sourceValue: string): void
  (e: 'setSleepTimer', minutes: number): void
  (e: 'logout'): void
  (e: 'switchAccount', userId: number): void
  (e: 'removeAccount', userId: number): void
  (e: 'about'): void
  (e: 'adminReview'): void
  (e: 'adminErrorLogs'): void
  (e: 'adminSongTags'): void
  (e: 'adminMessages'): void
  (e: 'contactAdmin'): void
}>()

/** 存在历史账号时才展示账号分组 */
const hasAccounts = computed(() => props.accounts.length > 0)
/** 仅有一个当前账号时不展示「切换账号」 */
const hasSwitchable = computed(() => props.accounts.some(a => a.userId !== props.currentUserId))

/** 设备平台：手机端才提供轻量版 App 入口 */
const mobilePlatform = detectMobilePlatform()

/** 当前构建版本：展示在应用安装卡片上 */
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''

/** 轻量版 App：iOS 下载描述文件安装桌面图标；Android 引导添加到主屏幕 */
async function onDownloadApp() {
  if (mobilePlatform === 'android') {
    showToast('请在浏览器菜单中选择「添加到主屏幕」')
    return
  }
  await downloadWebClipProfile()
  showToast('描述文件已下载，请到「设置」中安装')
}

const visible = defineModel<boolean>('visible', { required: true })
const pickerVisible = defineModel<boolean>('pickerVisible', { required: true })
const sleepVisible = defineModel<boolean>('sleepVisible', { required: true, default: () => false })

/** 「关于」入口的更新角标：当前版本与上次查看的版本不一致时显示 */
const LAST_SEEN_VERSION_KEY = 'ani.last_seen_version'
const hasUpdate = ref(false)
function refreshUpdateDot() {
  const current = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
  const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
  hasUpdate.value = Boolean(current && lastSeen && lastSeen !== current)
}
// 每次打开设置都重新比对，用户看完关于页后角标会消失
watch(visible, (show) => {
  if (show)
    refreshUpdateDot()
})
const switchVisible = ref(false)

const { swipeStyle, handlers, reset } = useSwipeClose(() => {
  // 子弹层打开时不响应右滑关闭
  if (pickerVisible.value || sleepVisible.value || switchVisible.value)
    return
  visible.value = false
})

function onClosed() {
  reset()
  switchVisible.value = false
}

/** 历史账号头像：无自定义头像时按用户名生成 */
function accountAvatar(account: SavedAccount) {
  return resolveAvatarOrDefault(account.avatar, account.username || String(account.userId))
}

function onSwitchAccount(account: SavedAccount) {
  if (account.userId === undefined || account.userId === props.currentUserId)
    return
  switchVisible.value = false
  emit('switchAccount', account.userId)
}

/** 删除历史账号：仅移除本地记录，当前登录状态不受影响 */
async function onRemoveAccount(account: SavedAccount) {
  const label = account.nickname || account.username
  try {
    await showConfirmDialog({
      title: '删除账号',
      message: `删除后将不再保留「${label}」的登录记录`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ee4d38',
    })
  } catch {
    return
  }
  emit('removeAccount', account.userId)
}

function openSourcePicker() {
  pickerVisible.value = true
}

function onPickSource(value: string) {
  emit('confirmSource', value)
}

function onPickSleep(minutes: number) {
  emit('setSleepTimer', minutes)
  sleepVisible.value = false
}
</script>

<style lang="scss" scoped>
.settings-popup {
  background: transparent !important;
}

.settings-wrap {
  height: 100%;
  color: var(--theme-text, #fff);
  background: var(--popup-bg);
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);

  .header-title {
    flex: 1;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }

  .close-icon {
    color: var(--theme-text, #fff);
    cursor: pointer;
  }
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 24px;
}

.settings-section + .settings-section {
  margin-top: 28px;
}

.section-title {
  font-size: 12px;
  opacity: 0.45;
  margin-bottom: 12px;
  padding-left: 4px;
}

.section-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: rgba(128, 128, 128, 0.08);
  border-radius: 14px;
  overflow: hidden;
}

.section-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px;
  cursor: pointer;
  transition: background 0.12s;

  &:active {
    background: rgba(128, 128, 128, 0.16);
  }

  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.12);
  }

  .item-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
  }

  /* 有新版本未查看时，「关于」旁的红色角标 */
  .update-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff5c7c;
  }

  .item-danger {
    color: #ee5a5a;
  }

  .item-value {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    opacity: 0.65;
  }

  .item-status {
    opacity: 0.85;
  }

  .item-arrow {
    opacity: 0.5;
  }
}

/** 轻量版下载卡片：柔和的浅底样式 */
.app-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(128, 128, 128, 0.06);

  .app-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    overflow: hidden;
    background: #101018;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .app-info {
    flex: 1;
    min-width: 0;
  }

  .app-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 500;
  }

  .app-tag {
    padding: 1px 6px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.7;
    background: rgba(128, 128, 128, 0.16);
  }

  .app-meta {
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.4;
  }

  .app-install {
    flex-shrink: 0;
    min-width: 60px;
    padding: 7px 16px;
    border: none;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    color: inherit;
    background: rgba(128, 128, 128, 0.18);
    cursor: pointer;
    transition: background 0.12s;

    &:active {
      background: rgba(128, 128, 128, 0.28);
    }
  }
}

/** 播放源选择 bottom sheet */
.source-sheet {
  padding: 4px 20px 20px;
  color: var(--theme-text, #fff);
  background: var(--popup-bg-raised);

  .sheet-title {
    padding: 16px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }
}

.source-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-btn {
  padding: 14px 0;
  border: none;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--theme-text, #fff);
  font-size: 15px;
  cursor: pointer;

  &.is-active {
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }
}

.source-sheet-hint {
  margin-top: 14px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}

/** 切换账号 bottom sheet */
.switch-sheet {
  padding: 4px 20px 20px;
  color: var(--theme-text, #fff);
  background: var(--popup-bg-raised);

  .sheet-title {
    padding: 16px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }
}

.switch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  cursor: pointer;

  &.current {
    cursor: default;
    opacity: 0.75;
  }
}

.switch-avatar {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
}

.switch-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.switch-name {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-username {
  font-size: 11px;
  opacity: 0.45;
}

.switch-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 10px;
}

.switch-arrow {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.4;
}

.switch-del {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: 0;
  background: transparent;
  color: rgba(238, 77, 56, 0.85);
  cursor: pointer;
}

.switch-del:active {
  opacity: 0.6;
}

.switch-empty {
  margin: 0;
  padding: 16px 0;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}

/** 定时关闭 bottom sheet */
.sleep-sheet {
  padding: 4px 20px 20px;
  color: var(--theme-text, #fff);
  background: var(--popup-bg-raised);

  .sheet-title {
    padding: 16px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }
}

.sleep-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sleep-btn {
  padding: 14px 0;
  border: none;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--theme-text, #fff);
  font-size: 15px;
  cursor: pointer;

  &.is-active {
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }
}
</style>
