import { createRouter, createWebHistory } from 'vue-router'

// 只有一个页面 —— Player.vue 内部用 currentTab 切换 发现/排行/音乐/福利/我的
// /song/:id、/playlist/:id 用于分享链接，页面由 PlayerView 自行解析
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/App.vue'),
    },
    {
      path: '/song/:id',
      name: 'song-share',
      component: () => import('@/App.vue'),
    },
    {
      path: '/playlist/:id',
      name: 'playlist-share',
      component: () => import('@/App.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
