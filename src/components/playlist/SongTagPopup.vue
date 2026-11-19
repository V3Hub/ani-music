<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="song-tag-popup"
    @update:show="emit('update:visible', $event)"
  >
    <div class="tag-popup">
      <div class="tag-head">
        <span class="tag-title">添加标签</span>
        <button type="button" class="tag-cancel" @click="emit('update:visible', false)">
          取消
        </button>
      </div>

      <div v-if="song" class="tag-song">
        {{ song.title }}<template v-if="song.singer"> · {{ song.singer }}</template>
      </div>

      <van-loading v-if="loading" class="tag-loading" size="20" color="#fff" />

      <template v-else>
        <div class="tag-list">
          <button
            v-for="item in tags"
            :key="item.tag"
            type="button"
            class="tag-chip"
            :class="{ mine: item.mine }"
            :disabled="submitting"
            @click="toggleTag(item.tag, item.mine)"
          >
            {{ item.tag }}<span v-if="item.count > 1" class="tag-count">{{ item.count }}</span>
          </button>
          <span v-if="!tags.length" class="tag-empty">还没有标签，来打第一个</span>
        </div>

        <textarea
          v-model="tagInput"
          class="tag-input"
          rows="2"
          maxlength="300"
          placeholder="每行一个标签（最多 12 字）"
        />

        <!-- 输入联想：按名称与图标规则动态匹配预设标签 -->
        <div v-if="suggestions.length" class="suggest-area">
          <span class="suggest-label">猜你想添加</span>
          <div class="suggest-list">
            <button
              v-for="preset in suggestions"
              :key="preset.tag"
              type="button"
              class="suggest-chip"
              :class="{ mine: isMine(preset.tag) }"
              :disabled="submitting"
              @click="toggleTag(preset.tag, isMine(preset.tag))"
            >
              {{ preset.tag }}
            </button>
          </div>
        </div>

        <div class="tag-input-foot">
          <span class="tag-input-count">{{ tagInput.length }}/300</span>
          <button type="button" class="tag-submit" :disabled="!canSubmit" @click="submitTag">
            {{ submitting ? '添加中' : '添加' }}
          </button>
        </div>
      </template>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { Song } from '@/types/music'
import type { SongTagItem } from '@/types/songTag'
import { addSongTag, getSongTags, removeSongTag } from '@/api/song-tag'
import { matchPresetTags } from '@/constants/song-tags'
import { showToast } from 'vant'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  song: Song | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'tagsChange', songId: number | string, tags: SongTagItem[]): void
}>()

const tags = ref<SongTagItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const tagInput = ref('')

/** 文本框按换行拆分，去重并过滤空行 */
const pendingTags = computed(() => [...new Set(
  tagInput.value.split(/\r?\n/).map(tag => tag.trim()).filter(Boolean),
)])

const canSubmit = computed(() => pendingTags.value.length > 0 && !submitting.value)

/** 取正在输入的最后一行做联想 */
const keyword = computed(() => tagInput.value.split(/\r?\n/).pop()?.trim() || '')
const suggestions = computed(() => matchPresetTags(keyword.value))

/** 当前用户是否已给这首歌打了某个标签 */
function isMine(tag: string) {
  return tags.value.some(item => item.tag === tag && item.mine)
}

async function loadTags() {
  const songId = props.song?.id
  if (!songId)
    return
  loading.value = true
  try {
    tags.value = (await getSongTags(songId)) || []
    emit('tagsChange', songId, tags.value)
  } catch {
    tags.value = []
  } finally {
    loading.value = false
  }
}

/** 点击标签：已打过则取消，否则添加 */
async function toggleTag(tag: string, mine: boolean) {
  const songId = props.song?.id
  if (!songId || submitting.value)
    return
  submitting.value = true
  try {
    if (mine) {
      await removeSongTag(songId, tag)
      showToast('已取消标签')
    } else {
      await addSongTag(songId, tag)
      showToast('已添加标签')
    }
    await loadTags()
  } catch {
    // 错误提示由请求层统一处理
  } finally {
    submitting.value = false
  }
}

/** 提交文本框中的标签：一行一个 */
async function submitTag() {
  const songId = props.song?.id
  const parts = pendingTags.value
  if (!songId || !parts.length || submitting.value)
    return
  const tooLong = parts.find(tag => tag.length > 12)
  if (tooLong) {
    showToast(`「${tooLong}」超过 12 个字`)
    return
  }
  submitting.value = true
  try {
    await Promise.all(parts.map(tag => addSongTag(songId, tag)))
    tagInput.value = ''
    showToast(parts.length > 1 ? `已添加 ${parts.length} 个标签` : '已添加标签')
    await loadTags()
  } catch {
    // 错误提示由请求层统一处理
  } finally {
    submitting.value = false
  }
}

/** 打开时加载标签，关闭时清理，避免残留上一首的数据 */
watch([() => props.visible, () => props.song?.id], ([visible]) => {
  if (!visible) {
    tags.value = []
    tagInput.value = ''
    return
  }
  loadTags()
})
</script>

<style lang="scss" scoped>
.song-tag-popup {
  background: var(--popup-bg-raised) !important;
}

.tag-popup {
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
}

.tag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  .tag-title {
    font-size: 15px;
    font-weight: 600;
  }

  .tag-cancel {
    padding: 4px 2px;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
  }
}

.tag-song {
  overflow: hidden;
  margin-bottom: 12px;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.45;
}

.tag-loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  min-height: 30px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;

  &.mine {
    border-color: transparent;
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.6;
  }

  .tag-count {
    font-size: 10px;
    opacity: 0.6;
  }
}

.tag-empty {
  font-size: 12px;
  opacity: 0.45;
}

.tag-input {
  display: block;
  width: 100%;
  min-height: 64px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  outline: none;
  resize: none;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}

.suggest-area {
  margin-top: 10px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);

  .suggest-label {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    opacity: 0.45;
  }
}

.suggest-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.suggest-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 13px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease;

  &.mine {
    border-color: transparent;
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }

  &:not(:disabled):active {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.tag-input-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.tag-input-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.tag-submit {
  height: 34px;
  padding: 0 20px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    background 0.2s ease;

  &:not(:disabled):active {
    background: rgba(255, 255, 255, 0.28);
    transform: scale(0.96);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>
