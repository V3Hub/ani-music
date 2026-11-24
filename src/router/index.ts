import { createRouter, createWebHistory } from 'vue-router'

// 主页面 —— PlayerView 内部用 currentTab 切换 发现/排行/音乐/福利/我的
// /song/:id、/playlist/:id 用于分享链接，页面由 PlayerView 自行解析
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/PlayerView.vue'),
    },
    {
      path: '/song/:id',
      name: 'song-share',
      component: () => import('@/views/PlayerView.vue'),
    },
    {
      path: '/playlist/:id',
      name: 'playlist-share',
      component: () => import('@/views/PlayerView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationView.vue'),
    },
    {
      path: '/user/:id',
      name: 'user-detail',
      component: () => import('@/views/UserDetailView.vue'),
    },
    {
      path: '/admin/review',
      name: 'adminReview',
      component: () => import('@/views/AdminReviewView.vue'),
    },
    {
      path: '/admin/error-logs',
      name: 'adminErrorLogs',
      component: () => import('@/views/AdminErrorLogView.vue'),
    },
    {
      path: '/admin/song-tags',
      name: 'adminSongTags',
      component: () => import('@/views/AdminSongTagView.vue'),
    },
    {
      path: '/admin/messages',
      name: 'adminMessages',
      component: () => import('@/views/AdminMessageView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
