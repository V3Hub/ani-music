<template>
  <div class="about-page">
    <header class="about-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">关于</span>
      <span class="header-space" />
    </header>

    <main class="about-main">
      <section class="brand">
        <div class="brand-glow" />
        <img class="brand-logo" :src="LOGO_URL" alt="">
        <h1>Ani 音乐</h1>
        <p class="brand-en">Ani Music</p>
        <p class="brand-slogan">
          总有声音，与你同行
        </p>
        <p class="brand-slogan-en">
          Music always with you
        </p>
        <div class="brand-version-row">
          <span class="brand-version">v{{ version }}</span>
          <span v-if="isUpdated" class="update-badge">NEW</span>
        </div>
      </section>

      <section class="about-card">
        <h2 class="card-title">
          关于应用
        </h2>
        <p class="card-text">
          Ani Music 是一个移动端优先的在线音乐播放器。从听歌出发，提供搜索、歌单、收藏、
          评论、心愿墙与福利中心，让音乐成为日常陪伴。
        </p>
      </section>

      <section class="about-card">
        <h2 class="card-title">
          应用信息
        </h2>
        <ul class="info-list">
          <li class="info-item">
            <span class="info-label">版本</span>
            <span class="info-value">v{{ version }}</span>
          </li>
          <li class="info-item">
            <span class="info-label">构建时间</span>
            <span class="info-value">{{ buildTime }}</span>
          </li>
          <li class="info-item">
            <span class="info-label">开源协议</span>
            <span class="info-value">MIT</span>
          </li>
        </ul>
      </section>

      <section class="about-card changelog">
        <h2 class="card-title">
          更新日志
        </h2>
        <div
          v-for="(release, idx) in changelog"
          :key="release.version"
          class="release"
          :class="{ latest: idx === 0, seen: idx === 0 && !isUpdated }"
        >
          <div class="release-head">
            <span class="release-version">v{{ release.version }}</span>
            <span v-if="idx === 0" class="release-badge">
              {{ isUpdated ? '有更新' : '最新' }}
            </span>
            <span class="release-date">{{ release.date }}</span>
          </div>
          <ul class="release-items">
            <li v-for="(item, i) in release.items" :key="i" class="release-item">
              <span
                class="item-tag"
                :style="{ background: changeLogTypeMeta[item.type].color }"
              >
                {{ changeLogTypeMeta[item.type].label }}
              </span>
              <span class="item-text">{{ item.text }}</span>
            </li>
          </ul>
        </div>
      </section>

      <p class="copyright">
        © 2026 Ani
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { CHANGELOG, CHANGELOG_TYPE_META } from '@/constants/changelog'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useRouter } from 'vue-router'

const LOGO_URL = '/qs.svg'

/** 构建时注入的版本号与时间（开发时未定义则回退占位） */
const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '-'

const changelog = CHANGELOG
const changeLogTypeMeta = CHANGELOG_TYPE_META

/** localStorage 保存用户上次看到的版本号，用于感知更新 */
const LAST_SEEN_VERSION_KEY = 'ani.last_seen_version'
const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
const isUpdated = Boolean(lastSeen && lastSeen !== version)

// 用户进入关于页时，把当前版本记为「已查看」
localStorage.setItem(LAST_SEEN_VERSION_KEY, version)

const router = useRouter()

/** 返回首页时切回「我的」页 */
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
.about-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.about-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;

  .back-btn,
  .header-space {
    width: 34px;
    height: 34px;
  }

  .back-btn {
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
  }
}

.about-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: 24px 24px 36px;
  overflow-y: auto;
}

.brand {
  position: relative;
  padding: 6px 0 14px;
  text-align: center;

  .brand-glow {
    position: absolute;
    top: -30px;
    left: 50%;
    width: 200px;
    height: 200px;
    transform: translateX(-50%);
    background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16), transparent 70%);
    filter: blur(22px);
    pointer-events: none;
  }

  .brand-logo {
    position: relative;
    z-index: 1;
    width: 64px;
    height: 64px;
    margin-bottom: 14px;
    border-radius: 18px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  }

  h1 {
    position: relative;
    z-index: 1;
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 1px;
  }

  .brand-en {
    position: relative;
    z-index: 1;
    margin: 0 0 12px;
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    opacity: 0.45;
  }

  .brand-slogan {
    position: relative;
    z-index: 1;
    margin: 0 0 2px;
    font-size: 13px;
    opacity: 0.55;
  }

  .brand-slogan-en {
    position: relative;
    z-index: 1;
    margin: 0 0 12px;
    font-size: 11px;
    letter-spacing: 0.5px;
    opacity: 0.38;
  }

  .brand-version-row {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .brand-version {
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 11px;
    opacity: 0.6;
  }

  .update-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff5c7c, #ff8a3d);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    animation: pulse 1.6s infinite;
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.85;
  }
}

.about-card {
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

.card-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.6);
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

  & + .info-item {
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .info-label {
    color: rgba(255, 255, 255, 0.55);
  }

  .info-value {
    text-align: right;
    color: rgba(255, 255, 255, 0.82);
  }
}

/*  changelog  */
.changelog {
  padding-bottom: 4px;
}

.release {
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.07);

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  &.latest {
    .release-version {
      color: #fff;
      font-weight: 600;
    }
  }

  &.seen {
    .release-version {
      opacity: 0.6;
    }
  }
}

.release-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .release-version {
    font-size: 14px;
    opacity: 0.85;
  }

  .release-badge {
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(255, 92, 124, 0.18);
    color: #ff8da1;
    font-size: 10px;
    font-weight: 600;
  }

  .release-date {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.45;
  }
}

.release-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.release-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);

  .item-tag {
    flex-shrink: 0;
    padding: 0 6px;
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    height: 16px;
    margin-top: 2px;
  }

  .item-text {
    min-width: 0;
  }
}

.copyright {
  margin: 6px 0 0;
  text-align: center;
  font-size: 11px;
  opacity: 0.35;
}
</style>
