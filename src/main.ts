import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initPlayerService } from './services/audio-player'
import { enableRemoteControls } from './services/remote-control'
import { ensureAutoToken } from './api/user'
import 'virtual:uno.css'
import 'vant/lib/index.css'
import './styles/common.scss'
import './styles/main.scss'

/** 关闭开屏动画：先淡出再从 DOM 移除 */
function dismissSplash() {
  const splash = document.getElementById('splash')
  if (!splash)
    return
  splash.classList.add('fade-out')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}

async function bootstrap() {
  try {
    const app = createApp(App)

    app.use(createPinia())
    app.use(router)

    // 初始化全局唯一的播放器服务（绑定 audio 事件）
    initPlayerService()

    // 启用键盘 / 电视遥控器按键监听
    enableRemoteControls()

    // 先拿 token 再挂页面 —— 失败返回 null 不阻断启动
    await ensureAutoToken()

    app.mount('#app')
  } finally {
    dismissSplash()
  }
}

bootstrap()
