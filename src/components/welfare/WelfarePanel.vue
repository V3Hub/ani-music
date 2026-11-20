<template>
  <div class="welfare-panel">
    <div class="panel-header">
      <h1 class="panel-title">福利中心</h1>
      <span class="panel-badge">每日更新</span>
    </div>

    <!-- 顶部主视觉 -->
    <div class="hero">
      <div class="hero-glow" />
      <div class="hero-kicker">DAILY BONUS</div>
      <h2 class="hero-title">外卖红包 天天领</h2>
      <p class="hero-sub">最高 66 元 · 点一下直达领取页</p>
      <div class="hero-chips">
        <span v-for="chip in heroChips" :key="chip">{{ chip }}</span>
      </div>
    </div>

    <!-- 红包列表 -->
    <div class="coupon-list">
      <a
        v-for="(coupon, index) in coupons"
        :key="coupon.name"
        class="coupon"
        :class="{ hot: coupon.hot }"
        :style="{ '--brand': coupon.color, 'animationDelay': `${index * 60}ms` }"
        :href="coupon.url"
        target="_blank"
        rel="noopener noreferrer"
        @click="track(coupon)"
      >
        <span v-if="coupon.hot" class="hot-flag">最热</span>
        <div class="coupon-amount">
          <span class="yen">¥</span>
          <span class="num">{{ coupon.amount }}</span>
        </div>
        <div class="coupon-info">
          <div class="coupon-name">{{ coupon.name }}</div>
          <div class="coupon-desc">{{ coupon.desc }}</div>
        </div>
        <div class="coupon-get">
          立即领取
          <van-icon name="arrow" size="11" />
        </div>
      </a>
    </div>

    <p class="welfare-tip">
      红包由各平台提供，领取后请在对应 App 内使用
    </p>
  </div>
</template>

<script setup lang="ts">
import { trackPromotion } from '@/utils/analytics'
import { onMounted } from 'vue'

const heroChips = ['美团外卖', '淘宝闪购', '京东外卖']

interface Coupon {
  name: string
  desc: string
  amount: number
  url: string
  color: string
  hot?: boolean
}

const coupons: Coupon[] = [
  {
    name: '美团外卖',
    desc: '天天神券 · 无门槛叠加',
    amount: 66,
    url: 'http://dpurl.cn/1Bttk9ez',
    color: '#ffd100',
    hot: true,
  },
  {
    name: '淘宝闪购',
    desc: '小时达 · 新人专享红包',
    amount: 25,
    url: 'https://u.ele.me/ZibYpl5q',
    color: '#ff5000',
  },
  {
    name: '京东外卖',
    desc: '品质外卖 · 下单立减',
    amount: 20,
    url: 'https://u.jd.com/jObWJr4',
    color: '#e1251b',
  },
]

/** 推广埋点：记录券点击明细，便于分析各渠道转化 */
function track(coupon: Coupon) {
  trackPromotion('coupon_click', {
    platform: coupon.name,
    coupon: coupon.desc,
    amount: coupon.amount,
    hot: coupon.hot ?? false,
    target: coupon.url,
  })
}

/** 福利页曝光，与点击一起构成转化漏斗 */
onMounted(() => {
  trackPromotion('welfare_view', { coupon_count: coupons.length })
})
</script>

<style lang="scss" scoped>
.welfare-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 18px 20px;
  box-sizing: border-box;
  color: var(--theme-text, #fff);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  .panel-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }

  .panel-badge {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 11px;
    color: #ffb020;
    background: rgba(255, 176, 32, 0.16);
  }
}

.hero {
  position: relative;
  overflow: hidden;
  padding: 22px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);

  .hero-glow {
    position: absolute;
    top: -60%;
    right: -20%;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 65%);
    animation: glow-float 5s ease-in-out infinite;
  }

  .hero-kicker {
    position: relative;
    font-size: 11px;
    letter-spacing: 3px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
  }

  .hero-title {
    position: relative;
    margin: 8px 0 6px;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #fff;
  }

  .hero-sub {
    position: relative;
    margin: 0 0 14px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.65);
  }

  .hero-chips {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    span {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.75);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
  }
}

.coupon-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.coupon {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  text-decoration: none;
  color: var(--theme-text, #fff);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;
  animation: coupon-in 0.4s ease both;

  // 左侧品牌色光带
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--brand);
  }

  &:active {
    transform: scale(0.975);
    border-color: var(--brand);
    background: rgba(255, 255, 255, 0.08);
  }

  &.hot {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 176, 32, 0.3);
  }

  .hot-flag {
    position: absolute;
    top: 0;
    right: 0;
    padding: 3px 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #ffcf70;
    background: rgba(255, 176, 32, 0.14);
    border-left: 1px solid rgba(255, 176, 32, 0.22);
    border-bottom: 1px solid rgba(255, 176, 32, 0.22);
    border-bottom-left-radius: 12px;
  }

  .coupon-amount {
    display: flex;
    align-items: baseline;
    min-width: 84px;

    .yen {
      font-size: 15px;
      font-weight: 700;
      color: var(--brand);
    }

    .num {
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -1px;
      background: linear-gradient(180deg, var(--brand), color-mix(in srgb, var(--brand) 65%, #fff));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  }

  .coupon-info {
    flex: 1;
    min-width: 0;

    .coupon-name {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .coupon-desc {
      font-size: 11.5px;
      opacity: 0.55;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .coupon-get {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 15px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease;
  }

  &:active .coupon-get {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.32);
  }
}

.welfare-tip {
  margin: 18px 0 0;
  text-align: center;
  font-size: 11px;
  opacity: 0.4;
}

@keyframes glow-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(-16px, 12px, 0);
  }
}

@keyframes coupon-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
