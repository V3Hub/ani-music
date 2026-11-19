/**
 * 轻量版 App：手机端下载 iOS 配置描述文件（Web Clip），
 * 安装后可在桌面生成直接打开本站的图标，无需安装完整 App。
 */

const APP_ICON_URL = '/qs.svg'
/** 桌面图标打开的地址，固定使用线上站点域名 */
const APP_URL = 'https://music.ani.l.cd'
const PROFILE_FILE_NAME = 'ani-music.mobileconfig'
const PROFILE_MIME = 'application/x-apple-aspen-config'
const CLIP_LABEL = 'Ani 音乐'

/** 设备平台：iOS 可安装描述文件；Android 使用浏览器「添加到主屏幕」 */
export type MobilePlatform = 'ios' | 'android' | 'other'

export function detectMobilePlatform(): MobilePlatform {
  const ua = navigator.userAgent
  // iPadOS 13+ 的 UA 伪装成 Macintosh，用触点数兜底识别
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1))
    return 'ios'
  if (/android|harmonyos/i.test(ua))
    return 'android'
  return 'other'
}

function randomUUID() {
  if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID().toUpperCase()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, (char) => {
      const rand = Math.floor(Math.random() * 16)
      const value = char === 'x' ? rand : (rand & 0x3) | 0x8
      return value.toString(16)
    })
    .toUpperCase()
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 把站点图标画成 180×180 PNG，返回 base64（失败时返回 null，描述文件将使用默认图标） */
function loadIconBase64(): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const size = 180
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.fillStyle = '#101018'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(image, 0, 0, size, size)
        resolve(canvas.toDataURL('image/png').split(',')[1] || null)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = APP_ICON_URL
  })
}

/** 生成安装到桌面的 Web Clip 描述文件内容 */
function buildProfile(iconBase64: string | null) {
  const pageUrl = escapeXml(APP_URL)
  const iconEntry = iconBase64
    ? `
        <key>Icon</key>
        <data>${iconBase64}</data>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>${iconEntry}
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>${CLIP_LABEL}</string>
      <key>PayloadDescription</key>
      <string>在桌面创建 ${CLIP_LABEL} 快捷方式</string>
      <key>PayloadDisplayName</key>
      <string>${CLIP_LABEL}</string>
      <key>PayloadIdentifier</key>
      <string>cc.ani.animusic.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>${randomUUID()}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${pageUrl}</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>${CLIP_LABEL} 轻量版</string>
  <key>PayloadIdentifier</key>
  <string>cc.ani.animusic.profile</string>
  <key>PayloadOrganization</key>
  <string>Ani</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${randomUUID()}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`
}

/** 下载描述文件：iOS 会提示保存到「设置」中安装 */
export async function downloadWebClipProfile() {
  const profile = buildProfile(await loadIconBase64())
  const blob = new Blob([profile], { type: PROFILE_MIME })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = PROFILE_FILE_NAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
}
