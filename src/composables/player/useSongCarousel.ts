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
    if (!hasUserTouch.value) return
    if (switchingLock) return
    if (!playList.value.length) return
    switchingLock = true
    const targetIdx = swiper.realIndex as number
    swiperIndex.value = targetIdx
    await playByIndex(targetIdx)
    setTimeout(() => {
      switchingLock = false
    }, 350)
  }

  /** 播放器切歌 → 轮播跟随（slideToLoop） */
  watch(currentSong, () => {
    if (!swiperRef.value) return
    const idx = playList.value.findIndex((song: Song) => song.id === currentSong.value?.id)
    if (idx >= 0 && swiperIndex.value !== idx) {
      // 列表过短时 loop 被关闭，只能用普通 slideTo
      if (swiperRef.value.params.loop)
        swiperRef.value.slideToLoop(idx, 300)
      else
        swiperRef.value.slideTo(idx, 300)
    }
  })

  /** 列表增减（如搜索加入新歌）后刷新轮播，避免 virtual 渲染空白 */
  watch(() => playList.value.length, async () => {
    await nextTick()
    swiperRef.value?.update()
  })

  return { swiperRef, swiperIndex, onSwiperReady, onSlideChange }
}
