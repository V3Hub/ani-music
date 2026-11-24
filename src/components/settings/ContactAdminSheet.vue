<template>
  <van-popup
    round
    position="bottom"
    :show="visible"
    teleport="body"
    :style="{ height: '72vh' }"
    class="contact-admin-popup"
    @closed="reset"
  >
    <div class="contact-admin" :style="dragStyle" v-on="handlers">
      <div class="drag-bar" />

      <header class="sheet-header">
        <span class="sheet-title">联系管理员</span>
        <span class="sheet-tip">{{ dialog.length ? `${dialog.length} 条消息` : '有问题反馈？给管理员发条消息吧' }}</span>
      </header>

      <div class="dialog-scroll" ref="scrollRef">
        <van-loading v-if="loading" class="dialog-loading" color="#a78bfa" size="20" />

        <p v-else-if="!dialog.length" class="dialog-empty">
          还没有留言，说点什么吧～
        </p>

        <template v-else>
          <div
            v-for="msg in dialog"
            :key="msg.id"
            class="msg-row"
            :class="{ me: !msg.from_admin, admin: msg.from_admin }"
          >
            <div class="msg-bubble">
              <p class="msg-text">{{ msg.content }}</p>
              <span class="msg-time">{{ formatTime(msg.create_time) }}</span>
            </div>
          </div>
        </template>
      </div>

      <footer class="input-bar">
        <textarea
          v-model="input"
          class="msg-input"
          rows="1"
          maxlength="500"
          placeholder="留言内容（最多 500 字）"
          :disabled="sending"
          @input="autoGrow"
          ref="inputRef"
        />
        <button
          type="button"
          class="send-btn"
          :class="{ 'is-disabled': sending || !input.trim() }"
          :disabled="sending || !input.trim()"
          @click="send"
        >
          <van-icon name="arrow-up" />
        </button>
      </footer>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { addAdminMessage, getAdminMessages, type AdminMessageItem } from '@/api/admin-message'
import { useSwipeDownClose } from '@/composables/useSwipeDownClose'
import { showToast } from 'vant'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { dragStyle, handlers, reset } = useSwipeDownClose({
  onClose: () => emit('update:visible', false),
  threshold: 100,
  lockDirection: true,
})

const dialog = ref<AdminMessageItem[]>([])
const input = ref('')
const loading = ref(false)
const sending = ref(false)
const scrollRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.visible, (v) => {
  if (v) loadDialog()
})

async function loadDialog() {
  loading.value = true
  try {
    dialog.value = await getAdminMessages()
    await nextTick(scrollToBottom)
  } catch {
    // request 层已统一弹 Toast
  } finally {
    loading.value = false
  }
}

function scrollToBottom() {
  scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'auto' })
}

function formatTime(time: string) {
  if (!time) return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return time
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

async function send() {
  const content = input.value.trim()
  if (!content || sending.value) return
  sending.value = true
  try {
    await addAdminMessage(content)
    input.value = ''
    if (inputRef.value) inputRef.value.style.height = 'auto'
    await loadDialog()
  } catch (e: unknown) {
    // 429 频控等后端提示
    const data = (e as { data?: { msg?: string } })?.data
    if (data?.msg) showToast(data.msg)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.contact-admin-popup {
  background: transparent !important;
}

.contact-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--popup-bg-elevated);
  border-radius: inherit;
  padding: 6px 0 0;
  touch-action: none;
}
.drag-bar {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.3;
  margin: 2px auto 6px;
  flex-shrink: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 10px;
  flex-shrink: 0;
}

.sheet-title {
  font-size: 15px;
  font-weight: 600;
}

.sheet-tip {
  font-size: 11px;
  opacity: 0.4;
}

.dialog-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 14px;
}

.dialog-loading {
  margin-top: 40%;
  display: block;
}

.dialog-empty {
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
  padding: 40px 0;
}

.msg-row {
  display: flex;
  margin-bottom: 10px;

  &.me {
    justify-content: flex-end;

    .msg-bubble {
      background: rgba(127, 90, 240, 0.85);
      border-top-right-radius: 4px;
    }
  }

  &.admin {
    justify-content: flex-start;

    .msg-bubble {
      background: rgba(255, 255, 255, 0.1);
      border-top-left-radius: 4px;
    }
  }
}

.msg-bubble {
  max-width: 76%;
  padding: 8px 12px;
  border-radius: 14px;
}

.msg-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.msg-time {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  opacity: 0.4;
  text-align: right;
}

.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.msg-input {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font: inherit;
  font-size: 13px;
  resize: none;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: rgba(127, 90, 240, 0.6);
  }
}

.send-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #7f5af0;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}
</style>
