<script setup lang="ts">
interface Props {
  current: 'home' | 'category' | 'purchase' | 'cart' | 'my';
}
const props = defineProps<Props>();

const TABS = [
  { key: 'home', label: '首页', path: '/pages/index/index' },
  { key: 'category', label: '分类', path: '/pages/category/index' },
  { key: 'purchase', label: '求购', path: '/pages/purchase/hall' },
  { key: 'cart', label: '购物车', path: '/pages/cart/index' },
  { key: 'my', label: '我的', path: '/pages/my/index' }
] as const;

function switchTo(path: string, key: string) {
  if (key === props.current) return;
  uni.switchTab({ url: path });
}
</script>

<template>
  <view class="ctab-wrap">
    <view class="ctab">
      <view
        v-for="t in TABS"
        :key="t.key"
        class="ctab-item"
        :class="{ active: current === t.key }"
        @click="switchTo(t.path, t.key)"
      >
        <view class="ctab-icon">
          <!-- home (lucide:house) -->
          <svg v-if="t.key === 'home'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <!-- category (lucide:layout-grid) -->
          <svg v-else-if="t.key === 'category'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
          <!-- purchase (lucide:hand-coins) -->
          <svg v-else-if="t.key === 'purchase'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
            <path d="m7 21l1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9M2 16l6 6" />
            <circle cx="16" cy="9" r="2.9" />
            <circle cx="6" cy="5" r="3" />
          </svg>
          <!-- cart (lucide:shopping-cart) -->
          <svg v-else-if="t.key === 'cart'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
          <!-- my (lucide:user) -->
          <svg v-else-if="t.key === 'my'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </view>
        <text class="ctab-label">{{ t.label }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ctab-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #FFFFFF;
  border-top: 1px solid #EDECE6;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 999;
  min-height: 56px;
}
.ctab {
  display: flex;
  align-items: stretch;
  padding: 8rpx 12rpx;
  gap: 6rpx;
}
.ctab-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8rpx 4rpx;
  border-radius: 24rpx;
  color: #86909C;
  transition: background 0.2s, color 0.2s;
}
.ctab-item.active {
  background: #EEF2FF;
  color: #4D80F0;
}

/* 图标容器：固定 24px，跨设备视觉恒定 */
.ctab-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}
.ctab-icon svg {
  width: 24px;
  height: 24px;
  display: block;
}

.ctab-label {
  font-size: 20rpx;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.5rpx;
  margin-top: 6rpx;
}

/* 极小屏 (iPhone SE 1/2, 老 Android) */
@media (max-width: 374px) {
  .ctab-icon,
  .ctab-icon svg {
    width: 22px;
    height: 22px;
  }
  .ctab-label { font-size: 22rpx; }
  .ctab-item { padding: 6rpx 2rpx; }
}

/* 平板 / 桌面浏览器 */
@media (min-width: 768px) {
  .ctab {
    max-width: 640px;
    margin: 0 auto;
  }
  .ctab-icon,
  .ctab-icon svg {
    width: 26px;
    height: 26px;
  }
  .ctab-label { font-size: 14px; }
}
</style>
