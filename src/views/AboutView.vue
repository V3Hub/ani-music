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
        <span class="brand-version">v{{ VERSION }}</span>
      </section>

      <section class="about-card">
        <h2 class="card-title">
          关于应用
        </h2>
        <p class="card-text">
          Ani Music音乐是一个移动端优先的在线音乐播放器。从听歌出发，提供搜索、歌单、收藏、
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
            <span class="info-value">v{{ VERSION }}</span>
          </li>
          <li class="info-item">
            <span class="info-label">开源协议</span>
            <span class="info-value">MIT</span>
          </li>
        </ul>
      </section>

      <p class="copyright">
        © 2026 V3Hub
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useRouter } from 'vue-router'

const LOGO_URL = '/qs.svg'
const VERSION = '0.1.0'

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
  padding: calc(10px + env(safe-area-inset-top)) 14px 0;

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
  padding: 24px 24px calc(36px + env(safe-area-inset-bottom));
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

  .brand-version {
    position: relative;
    z-index: 1;
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 11px;
    opacity: 0.6;
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

.card-text-en {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.4);
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

.copyright {
  margin: 6px 0 0;
  text-align: center;
  font-size: 11px;
  opacity: 0.35;
}
</style>
