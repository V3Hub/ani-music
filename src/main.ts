import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { showToast } from 'vant'
import App from './App.vue'
import router from './router'
import { initPlayerService } from './services/audio-player'
import { enableRemoteControls } from './services/remote-control'
import { ensureAutoToken } from './api/user'
import 'virtual:uno.css'
import 'vant/lib/index.css'
import './styles/main.scss'

const LAST_SEEN_VERSION_KEY = 'ani.last_seen_version'

async function bootstrap() {
  try {
    const app = createApp(App)

    app.use(createPinia())
    app.use(router)

    // 初始化全局唯一的播放器服务（绑定 audio 事件）
    initPlayerService()

    // 启用键盘 / 电视遥控器按键监听（老电视上失败不影响启动）
    try {
      enableRemoteControls()
    } catch (err) {
      console.warn('[bootstrap] 遥控器监听初始化失败', err)
    }

    // 先拿 token 再挂页面，避免首屏请求在无 token 状态下触发重登/刷新循环
    // 指纹采集（内部 5s 上限）与请求（axios 10s 超时）都自带兜底，不会无限等待
    await ensureAutoToken().catch(() => null)

    app.mount('#app')

    // 版本变更提示：对比 localStorage 保存的上次版本与当前构建版本，
    // 不同则弹出一次轻提示，引导用户到关于页看 changelog
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
    if (currentVersion) {
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
      if (lastSeen && lastSeen !== currentVersion) {
        showToast({
          type: 'success',
          message: `已更新到 v${currentVersion}，关于页查看更新内容`,
          duration: 2800,
        })
      }
      localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion)
    }
  } catch (err) {
    console.error('[bootstrap] 应用启动失败', err)
  } finally {
    dismissSplash()
  }
}

/** 关闭开屏动画：先淡出再从 DOM 移除（老电视浏览器可能不触发 transitionend，兜底强制移除） */
function dismissSplash() {
  const splash = document.getElementById('splash')
  if (!splash)
    return
  let removed = false
  const remove = () => {
    if (removed)
      return
    removed = true
    splash.remove()
  }
  splash.classList.add('fade-out')
  splash.addEventListener('transitionend', remove, { once: true })
  window.setTimeout(remove, 800)
}

bootstrap()
