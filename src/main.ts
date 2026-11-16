import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initPlayerService } from './services/audio-player'
import { enableRemoteControls } from './services/remote-control'
import { ensureAutoToken } from './api/user'
import 'virtual:uno.css'
import 'vant/lib/index.css'
import './styles/main.scss'

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
