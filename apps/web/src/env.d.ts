/// <reference types="vite/client" />

/** Vite 构建时从 package.json 注入的版本号 */
declare const __APP_VERSION__: string
/** Vite 构建时注入的构建时间 YYYY-MM-DD HH:mm:ss */
declare const __BUILD_TIME__: string

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_API_TIMEOUT: string
  readonly VITE_API_PROXY_TARGET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{}, {}, any>
  export default component
}
