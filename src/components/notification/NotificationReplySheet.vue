<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="notification-reply-popup"
    :style="{ background: 'transparent' }"
    @update:show="emit('update:visible', $event)"
    @closed="reset"
  >
    <div class="notification-reply" :style="dragStyle" v-on="handlers">
      <div class="drag-bar" @click="onBarClick" />

      <header class="reply-header">
        <div class="header-text">
          <h3>{{ title }}</h3>
          <p class="quote">{{ quote }}</p>
        </div>
      </header>

      <div class="reply-body">
        <van-field
          v-model="draft"
          type="textarea"
          rows="4"
          :maxlength="maxLength"
          show-word-limit
          :placeholder="placeholder"
          :autofocus="false"
        />
      </div>

      <footer class="reply-footer">
        <button class="cancel-btn" @click="close">取消</button>
        <button class="send-btn" :disabled="sending || !draft.trim()" @click="send">
          {{ sending ? '发送中…' : '发送' }}
        </button>
      </footer>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showToast } from 'vant'
import { addSongComment } from '@/api/music'
import { addWishMessage } from '@/api/wish'
import { sendUserMessage } from '@/api/user'
import { useSwipeDownClose } from '@/composables/useSwipeDownClose'
import type { UserNotification } from '@/types/notification'

const props = defineProps<{
  visible: boolean
  item: UserNotification | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'sent': []
}>()

const draft = ref('')
const sending = ref(false)

const { dragStyle, handlers, reset, wasDragged } = useSwipeDownClose({
  onClose: () => emit('update:visible', false),
  threshold: 100,
})

function onBarClick() {
  if (!wasDragged()) close()
}

function close() {
  emit('update:visible', false)
}

const title = computed(() => {
  if (!props.item) return '回复'
  if (props.item.type === 'comment_reply') return `回复 @${props.item.senderName} 的评论`
  if (props.item.type === 'wish_message') return `回复 @${props.item.senderName} 的心愿留言`
  if (props.item.type === 'user_message') return `回复 @${props.item.senderName} 的留言`
  return '回复'
})

const quote = computed(() => {
  if (!props.item) return ''
  const text = props.item.content || ''
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
})

const placeholder = computed(() => {
  if (!props.item) return '说点什么…'
  return `回复 ${props.item.senderName}…`
})

const maxLength = computed(() => {
  if (!props.item) return 500
  return props.item.type === 'user_message' ? 200 : 500
})

watch(() => props.visible, (v) => {
  if (v) draft.value = ''
})

async function send() {
  const item = props.item
  if (!item) return
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  try {
    if (item.type === 'comment_reply') {
      if (!item.targetId || !item.refId) {
        showToast('回复失败：缺少目标信息')
        return
      }
      await addSongComment({ songId: item.targetId, content: text, parentId: item.refId })
    } else if (item.type === 'wish_message') {
      if (!item.targetId) {
        showToast('回复失败：缺少心愿 ID')
        return
      }
      await addWishMessage(item.targetId, text)
    } else if (item.type === 'user_message') {
      await sendUserMessage(item.senderId, text)
    } else {
      showToast('该类型通知不支持回复')
      return
    }
    showToast('已回复')
    emit('sent')
    close()
  } catch {
    // axios 拦截器已提示
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.notification-reply-popup {
  background: transparent !important;
}
.notification-reply {
  background: var(--popup-bg-elevated);
  border-radius: inherit;
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
  max-height: 80vh;
  will-change: transform;
}
.drag-bar {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.3;
  margin: 8px auto 12px;
  cursor: pointer;
}
.reply-header {
  margin-bottom: 12px;
}
.header-text h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--theme-text);
}
.quote {
  font-size: 13px;
  color: var(--theme-text);
  opacity: 0.55;
  margin: 0;
  line-height: 1.4;
  word-break: break-word;
}
.reply-body :deep(.van-field) {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px;
}
.reply-body :deep(.van-field__control) {
  color: var(--theme-text);
  font-size: 14px;
  line-height: 1.5;
}
.reply-body :deep(.van-field__word-limit) {
  color: var(--theme-text);
  opacity: 0.4;
}
.reply-footer {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.cancel-btn,
.send-btn {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.cancel-btn {
  background: rgba(128, 128, 128, 0.15);
  color: var(--theme-text);
}
.send-btn {
  background: var(--theme-primary);
  color: #fff;
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
