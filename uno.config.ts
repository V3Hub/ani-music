import { defineConfig, presetUno, presetAttributify, transformerDirectives } from 'unocss'

export default defineConfig({
  // Uno 预设 = Tailwind + WindiCSS + 一些通用 rules 的合集
  presets: [
    presetUno(),
    presetAttributify(),
  ],
  // 允许 @apply / @screen 等指令写法
  transformers: [
    transformerDirectives(),
  ],
  // 扫描范围
  content: {
    pipeline: [
      // 所有源码 + index.html
      { filesystem: ['src/**/*.{vue,ts,tsx,js,jsx,html}', 'index.html'] },
    ],
  },
  // 安全列表：动态拼接的 class 要提前列出来
  safelist: [],
  // 主题扩展
  theme: {
    colors: {
      primary: '#ff6b6b',
    },
  },
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'text-ellipsis': 'overflow-hidden text-ellipsis whitespace-nowrap',
  },
})
