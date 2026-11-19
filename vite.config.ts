import { resolve } from 'node:path'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { VantResolver } from '@vant/auto-import-resolver'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import legacy from '@vitejs/plugin-legacy'
import { defineConfig, loadEnv } from 'vite'

/** 读取 package.json 版本号，构建时注入到前端 */
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const APP_VERSION = pkg.version
const BUILD_TIME = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    plugins: [
      UnoCSS(),
      vue(),
      Components({
        resolvers: [
          VantResolver(),
        ],
      }),
      // 兼容老电视/机顶盒浏览器：额外产出 nomodule 包 + core-js polyfill
      legacy({
        targets: ['chrome >= 49', 'chromeAndroid >= 49', 'safari >= 10', 'ios >= 10'],
        // 现代包按“能识别 module 的最低版本”编译，避免 Chrome 64~79 / iOS 12 这类
        // 支持 module 但不支持 ?. / ?? 的浏览器被误判为现代后解析失败白屏
        modernTargets: 'chrome >= 64, chromeAndroid >= 64, edge >= 79, firefox >= 67, safari >= 12, ios >= 12',
        renderLegacyChunks: true,
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
