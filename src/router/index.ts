import { createRouter, createWebHistory } from 'vue-router'

// 只有一个页面 —— Player.vue 内部用 currentTab 切换 发现/排行/音乐/福利/我的
// 如需子路由（例如 /player?id=xxx），在这里追加
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/App.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
