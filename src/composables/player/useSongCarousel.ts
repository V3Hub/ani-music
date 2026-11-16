/**
 * 歌曲轮播 —— Swiper 垂直轮播实例与切歌联动
 */
import type { Song } from '@/types/music'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import type { Swiper as SwiperType } from 'swiper'
import { computed, nextTick, ref, watch } from 'vue'

export function useSongCarousel() {
  const player = usePlayerStore()

  /** Swiper 实例 */
  const swiperRef = ref<SwiperType>()
  /** 当前 slide 索引（双向绑定） */
  const swiperIndex = ref<number>()
  /** 是否初始化完毕（延迟 50ms 确保 ready） */
  const swiperReady = ref(false)
  /** 用户是否触摸过（避免初始化时误触发切歌） */
  const hasUserTouch = ref(false)

  const playList = computed(() => player.playList)
  const currentSong = computed(() => player.currentSong)

  /** 防止快速连滑重复触发 */
  let switchingLock = false

  function onSwiperReady(swiper: SwiperType) {
    swiperRef.value = swiper
    setTimeout(() => {
      swiperReady.value = true
    }, 50)
    swiper.on('touchStart', () => {
      hasUserTouch.value = true
    })
  }

  /** 用户手动滑动结束 → 播放对应歌曲 */
  async function onSlideChange(swiper: any) {
    if (!swiperReady.value) return
    // 只响应用户手势触发的切换，程序化的 slideTo 不切歌
    if (!hasUserTouch.value) return
    hasUserTouch.value = false
    if (switchingLock) return
    if (!playList.value.length) return

    const targetIdx = swiper.realIndex as number
    swiperIndex.value = targetIdx
    const target = playList.value[targetIdx]
    // 滑到的就是当前播放的歌：只同步高亮，不重复加载
    if (!target || target.id === currentSong.value?.id)
      return

    switchingLock = true
    await playByIndex(targetIdx)
    setTimeout(() => {
      switchingLock = false
    }, 350)
  }

  /** 程序化切换到「当前播放歌曲」对应的 slide */
  function syncToCurrent(duration: number) {
    const swiper = swiperRef.value
    if (!swiper) return
    const idx = playList.value.findIndex((song: Song) => song.id === currentSong.value?.id)
    if (idx < 0) return
    // 列表过短时 loop 被关闭，只能用普通 slideTo
    if (swiper.params.loop)
      swiper.slideToLoop(idx, duration)
    else
      swiper.slideTo(idx, duration)
    swiperIndex.value = idx
  }

  /** 播放器切歌 → 轮播跟随 */
  watch(currentSong, () => syncToCurrent(300))

  /**
   * 歌单被整体替换（切换歌单、搜索加入新歌等）：
   * v-for 的 slide 会被重建，Swiper 内部缓存仍是旧节点，必须等 DOM 更新后
   * 先 update() 再对齐当前歌曲；只监听长度会漏掉「新旧歌单长度相同」的情况
   */
  watch(() => player.playList, async () => {
    await nextTick()
    const swiper = swiperRef.value
    if (!swiper) return
    swiper.update()
    syncToCurrent(0)
  })

  return { swiperRef, swiperIndex, onSwiperReady, onSlideChange }
}
