/**
 * 歌曲轮播 —— Swiper 垂直轮播实例与切歌联动
 *
 * 队列变化（切歌单 / 搜索加歌）时整块重建 Swiper：
 * Swiper 的 loop 模式会克隆 DOM 节点，而 v-for 重建的 slide 与旧克隆不匹配，
 * 只调用 update() 仍会出现「声音是这首、封面是另一首」的错位。
 */
import type { Song } from '@/types/music'
import { playByIndex } from '@/services/audio-player'
import { usePlayerStore } from '@/stores/player'
import type { Swiper as SwiperType } from 'swiper'
import { computed, ref, watch } from 'vue'

export function useSongCarousel() {
  const player = usePlayerStore()

  /** Swiper 实例 */
  const swiperRef = ref<SwiperType>()
  /** 是否初始化完毕（延迟 50ms 确保 ready） */
  const swiperReady = ref(false)
  /** 用户是否触摸过（避免初始化时误触发切歌） */
  const hasUserTouch = ref(false)

  const playList = computed(() => player.playList)
  const currentSong = computed(() => player.currentSong)

  /** 队列指纹：作为 Swiper 的 key，队列内容变化时强制重建实例 */
  const queueKey = computed(() => playList.value.map(song => song.id).join('|'))

  /** 重建时直接落到当前播放歌曲，避免先闪一下第一首 */
  const initialSlide = computed(() => {
    const idx = playList.value.findIndex((song: Song) => song.id === currentSong.value?.id)
    return idx < 0 ? 0 : idx
  })

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
  }

  /** 播放器切歌（下一首 / 上一首 / 自动播放）→ 轮播跟随 */
  watch(currentSong, () => syncToCurrent(300))

  return { queueKey, initialSlide, onSwiperReady, onSlideChange }
}
