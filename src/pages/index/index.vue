<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { fetchImUnreadCount, fetchNotificationUnreadCount } from '@/service/api/notify';
import { imSocket } from '@/service/im-socket';
import { fetchCategoryTree } from '@/service/api/category';
import {
  fetchBanners,
  fetchBestSellers,
  fetchFlashSale,
  fetchNewArrivals,
  fetchStorefrontRecommend
} from '@/service/api/product';
import { UI_ASSETS } from '@/constants/ui-assets';
import { go } from '@/utils/navigate';
import ProductCard from '@/components/product/product-card.vue';

interface CategoryNode {
  id: string;
  name: string;
}

const loading = ref(false);
const categoryRoots = ref<CategoryNode[]>([]);
const recommended = ref<Api.RealProduct.ProductDTO[]>([]);
const hot = ref<Api.RealProduct.ProductDTO[]>([]);
const newest = ref<Api.RealProduct.ProductDTO[]>([]);
const flashItems = ref<Api.RealProduct.FlashSaleItemVO[]>([]);
const promoBanners = ref<Api.RealProduct.BannerDTO[]>([]);
const failedModules = ref<string[]>([]);
const loadFailed = computed(() => failedModules.value.length > 0);
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let loadSequence = 0;
let unreadSequence = 0;
let unreadLoading = false;
let unreadRequested = false;
let unsubscribeRealtime: (() => void) | undefined;
let unsubscribeState: (() => void) | undefined;
let refreshedExpiry = '';
const userStore = useUserStore();
const unread = ref<number>();
const unreadFailed = ref(false);
const page = usePageOperation(() => {
  unreadSequence++;
  unread.value = undefined;
  unreadFailed.value = false;
  unreadLoading = false;
  unreadRequested = false;
  stopRealtime();
});

const categoryIcons = ['phone', 'shop', 'gift', 'cart', 'bags', 'star'];
const visibleCategories = computed(() => categoryRoots.value.slice(0, 10));

function endTime(value: string | number): number {
  if (value == null || String(value).trim() === '') return NaN;
  const time = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return time > 0 ? time : NaN;
}
const activeFlash = computed(() => flashItems.value.filter(item => endTime(item.sessionEndTime) > now.value));
const flash = computed(() => activeFlash.value.map(toFlashProduct));
const countdown = computed(() => {
  const endTimes = activeFlash.value.map(item => endTime(item.sessionEndTime));
  if (!endTimes.length) return flashItems.value.some(item => !Number.isFinite(endTime(item.sessionEndTime))) ? '活动时间待确认' : '已结束';
  const seconds = Math.max(0, Math.floor((Math.min(...endTimes) - now.value) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(' : ');
});

function toFlashProduct(item: Api.RealProduct.FlashSaleItemVO): Api.RealProduct.ProductDTO {
  return {
    id: item.productId,
    sellerId: '',
    title: item.title,
    categoryId: '',
    price: item.flashPrice,
    stock: item.stock,
    afterSaleType: 'NONE',
    status: 'ON_SALE',
    statusText: '秒杀中',
    salesCount: item.salesCount,
    images: item.image ? [item.image] : []
  };
}

async function load(keys?: string[]) {
  if (!page.visible.value || loading.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  loading.value = true;
  const valid = () => sequence === loadSequence && operation.isCurrent();
  const modules: Record<string, () => Promise<() => void>> = {
    categories: async () => { const value = await fetchCategoryTree({ onlyEnabled: true }); return () => { categoryRoots.value = value; }; },
    recommended: async () => { const value = await fetchStorefrontRecommend(6); return () => { recommended.value = value; }; },
    hot: async () => { const value = await fetchBestSellers(1, 6); return () => { hot.value = value.records || []; }; },
    newest: async () => { const value = await fetchNewArrivals(1, 6); return () => { newest.value = value.records || []; }; },
    flash: async () => { const value = await fetchFlashSale(4); return () => { flashItems.value = value; }; },
    banners: async () => { const value = await fetchBanners(); return () => { promoBanners.value = value.filter(item => item.enabled !== false).slice(0, 2); }; }
  };
  await Promise.all((keys || Object.keys(modules)).map(async key => {
    try {
      const apply = await modules[key]();
      if (!valid()) return;
      apply();
      failedModules.value = failedModules.value.filter(item => item !== key);
    } catch {
      if (valid() && !failedModules.value.includes(key)) failedModules.value.push(key);
    }
  }));
  if (sequence === loadSequence) loading.value = false;
}

function stopRealtime() {
  unsubscribeRealtime?.(); unsubscribeRealtime = undefined;
  unsubscribeState?.(); unsubscribeState = undefined;
  imSocket.stopIfUnused();
}
async function refreshUnread() {
  if (!page.visible.value) return;
  if (unreadLoading) { unreadRequested = true; return; }
  const operation = page.capture();
  const sequence = ++unreadSequence;
  unreadLoading = true;
  try {
    await userStore.init();
    if (!operation.isCurrent() || sequence !== unreadSequence) return;
    if (!userStore.currentUser) {
      unread.value = undefined;
      unreadFailed.value = !!getAccessToken();
      stopRealtime();
      return;
    }
    if (!unsubscribeRealtime) {
      unsubscribeRealtime = imSocket.subscribe(event => {
        if (['NOTIFICATION', 'IM_MESSAGE', 'IM_READ', 'IM_RECALL'].includes(String((event as { type?: unknown })?.type || '').toUpperCase())) void refreshUnread();
      });
      unsubscribeState = imSocket.subscribeState(state => { if (state === 'ready') void refreshUnread(); });
      imSocket.start().catch(() => undefined);
    }
    const counts = await Promise.all([fetchNotificationUnreadCount(), fetchImUnreadCount()]);
    if (!operation.isCurrent() || sequence !== unreadSequence) return;
    if (counts.some(value => value == null || String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0)) throw new Error('未读数无效');
    unread.value = counts.reduce((sum, count) => sum + Number(count), 0);
    unreadFailed.value = false;
  } catch {
    if (operation.isCurrent() && sequence === unreadSequence) { unread.value = undefined; unreadFailed.value = true; }
  } finally {
    if (sequence === unreadSequence) {
      unreadLoading = false;
      if (unreadRequested && page.visible.value) { unreadRequested = false; void refreshUnread(); }
    }
  }
}
function tickCountdown() {
  now.value = Date.now();
  const expired = flashItems.value.filter(item => endTime(item.sessionEndTime) <= now.value)
    .map(item => `${item.sessionId}:${item.sessionEndTime}`).sort().join('|');
  if (expired && expired !== refreshedExpiry && !loading.value) {
    refreshedExpiry = expired;
    void load(['flash']);
  }
}
function leavePage() {
  loadSequence++; unreadSequence++;
  loading.value = false; unreadLoading = false; unreadRequested = false;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = undefined;
  stopRealtime();
}
onShow(() => {
  now.value = Date.now();
  void load();
  void refreshUnread();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tickCountdown, 1000);
});
onHide(leavePage);
onUnload(leavePage);
watch(() => userStore.realUserId, () => { if (page.visible.value) void refreshUnread(); });

function goCategory(id?: string | number) {
  go(`/pages/product/list${id ? `?categoryId=${encodeURIComponent(String(id))}` : ''}`);
}

function goSearch() {
  go('/pages/product/list');
}

function goPurchase() {
  go('/pages/purchase/hall');
}

function goBanner(path?: string) {
  if (path?.startsWith('/pages/')) go(path);
  else goSearch();
}
</script>

<template>
  <view class="home-page h5-tab-page">
    <view class="home-header">
      <view class="brand yb-pressable" @click="goSearch">
        <image :src="UI_ASSETS.icons.appMark" class="brand-icon" mode="aspectFit" />
      </view>
      <view class="search-entry yb-pressable" @click="goSearch">
        <wd-icon name="search" size="42rpx" />
        <text>搜索商品 / 买手</text>
      </view>
      <view class="message-entry yb-pressable" @click="go('/pages/message/index')">
        <wd-icon name="chat" size="48rpx" />
        <view v-if="unread !== undefined && unread > 0" class="notice-dot" />
      </view>
    </view>

    <view class="hero yb-pressable">
      <image :src="UI_ASSETS.backgrounds.home" mode="aspectFill" class="hero-image" />
      <view class="hero-content">
        <text class="hero-title">高级选品，链上撮合</text>
        <text class="hero-subtitle">全球买手 24h 内响应 · 押金担保</text>
        <view class="hero-actions">
          <view class="hero-primary" @click="goSearch">探索商品</view>
          <view class="hero-secondary" @click="goPurchase">发起求购</view>
        </view>
      </view>
    </view>

    <view v-if="loadFailed" class="data-notice" @click="load([...failedModules])">{{ loading ? '正在重试失败内容…' : '部分首页内容加载失败，点击重试' }}</view>
    <view v-if="unreadFailed" class="data-notice" @click="refreshUnread">消息未读状态暂不可用，点击重试；仍可进入消息中心。</view>

    <view
      v-if="visibleCategories.length"
      class="category-card"
      :class="{ 'category-card--compact': visibleCategories.length < 5 }"
    >
      <view
        v-for="(category, index) in visibleCategories"
        :key="category.id"
        class="category-item yb-pressable"
        :class="{ 'category-item--compact': visibleCategories.length < 5 }"
        @click="goCategory(category.id)"
      >
        <wd-icon :name="categoryIcons[index % categoryIcons.length]" size="52rpx" />
        <text>{{ category.name }}</text>
        <wd-icon v-if="visibleCategories.length < 5" class="category-arrow" name="arrow-right" size="30rpx" />
      </view>
    </view>

    <view v-if="flashItems.length" class="section flash-section">
      <view class="section-head">
        <view class="section-title-wrap">
          <text class="section-title">限时秒杀</text>
          <view class="countdown"><text v-if="flash.length">距结束</text><text class="timer">{{ countdown }}</text></view>
        </view>
        <view class="section-more" @click="goSearch"><text>查看更多</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <scroll-view v-if="flash.length" scroll-x class="flash-scroll" :show-scrollbar="false">
        <view class="flash-list">
          <view v-for="item in flash" :key="String(item.id)" class="flash-product">
            <ProductCard :product="item" />
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="promoBanners.length" class="promo-grid">
      <view
        v-for="banner in promoBanners"
        :key="String(banner.id)"
        class="promo-banner yb-pressable"
        @click="goBanner(banner.pathTo)"
      >
        <image :src="banner.image" mode="aspectFill" class="promo-image" />
        <view class="promo-overlay" />
        <view class="promo-copy">
          <text v-if="banner.tag" class="promo-tag">{{ banner.tag }}</text>
          <text v-if="banner.title" class="promo-title">{{ banner.title }}</text>
          <text v-if="banner.subtitle" class="promo-subtitle">{{ banner.subtitle }}</text>
        </view>
      </view>
    </view>

    <view v-if="recommended.length || loading" class="section product-section">
      <view class="section-head">
        <text class="section-title">为你推荐</text>
        <view class="section-more" @click="goSearch"><text>查看更多</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <view v-if="recommended.length" class="product-grid">
        <ProductCard v-for="product in recommended" :key="String(product.id)" :product="product" />
      </view>
      <view v-else class="product-grid" aria-hidden="true">
        <view v-for="index in 2" :key="index" class="product-skeleton" />
      </view>
    </view>

    <view v-if="hot.length" class="section product-section">
      <view class="section-head">
        <text class="section-title">热销榜</text>
        <view class="section-more" @click="goSearch"><text>查看全部</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <view class="product-grid">
        <ProductCard v-for="product in hot" :key="String(product.id)" :product="product" />
      </view>
    </view>

    <view v-if="newest.length" class="section product-section">
      <view class="section-head">
        <text class="section-title">新品直邮</text>
        <view class="section-more" @click="goSearch"><text>查看全部</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <view class="product-grid">
        <ProductCard v-for="product in newest" :key="String(product.id)" :product="product" />
      </view>
    </view>

    <view class="ai-entry yb-pressable" @click="go('/pages/ai/index')">
      <view class="ai-copy"><text>AI 智能导购</text><text>告诉我你想要的商品，帮你快速匹配全球买手</text></view>
      <image :src="UI_ASSETS.illustrations.ai" mode="aspectFit" />
      <wd-icon name="arrow-right" size="32rpx" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.home-page {
  min-height: 100%;
  padding-bottom: 32rpx;
  background: var(--yb-bg);
}
.data-notice { margin: 0 20rpx 20rpx; padding: 18rpx 22rpx; border-radius: 16rpx; background: #fff6e8; color: #a85a00; font-size: 22rpx; }

.home-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  min-height: 112rpx;
  padding: calc(env(safe-area-inset-top) + 16rpx) 32rpx 16rpx;
  background: var(--yb-surface);
  gap: 16rpx;
}

.brand { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 80rpx; min-width: 40px; height: 80rpx; min-height: 40px; }
.brand-icon { display: block; width: 56rpx; height: 56rpx; border-radius: 16rpx; }
.search-entry { display: flex; flex: 1; align-items: center; height: 80rpx; min-height: 40px; padding: 0 22rpx; border: 1rpx solid var(--yb-hairline-2); border-radius: var(--yb-radius-pill); color: var(--yb-muted); font-size: var(--yb-fs-body); gap: 14rpx; }
.message-entry { position: relative; display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 80rpx; min-width: 40px; height: 80rpx; min-height: 40px; color: var(--yb-ink); }
.notice-dot { position: absolute; top: 12rpx; right: 1rpx; width: 14rpx; height: 14rpx; border: 2rpx solid var(--yb-surface); border-radius: 50%; background: var(--yb-brand); }

.hero { position: relative; height: 352rpx; margin: 16rpx 20rpx 24rpx; overflow: hidden; border-radius: var(--yb-radius-card); background: var(--yb-deep); box-shadow: var(--yb-shadow-float); }
.hero-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-content { position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: center; width: 68%; height: 100%; padding: 34rpx 32rpx; color: var(--yb-surface); }
.hero-title { font-size: 42rpx; font-weight: 700; letter-spacing: -1.5rpx; line-height: 1.25; }
.hero-subtitle { margin-top: 12rpx; font-size: var(--yb-fs-body-sm); line-height: 36rpx; opacity: .9; }
.hero-actions { display: flex; margin-top: 22rpx; gap: 14rpx; }
.hero-primary, .hero-secondary { display: flex; align-items: center; justify-content: center; min-width: 132rpx; height: 80rpx; padding: 0 18rpx; border-radius: 20rpx; font-size: var(--yb-fs-body-sm); font-weight: 600; }
.hero-primary { background: var(--yb-brand); color: var(--yb-surface); }
.hero-secondary { border: 1rpx solid rgba(255, 255, 255, .78); color: var(--yb-surface); }
.category-card { display: flex; flex-wrap: wrap; margin: 0 20rpx; padding: 16rpx 8rpx; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-card); background: var(--yb-surface); box-shadow: var(--yb-shadow-card); }
.category-item { display: flex; flex: none; flex-direction: column; align-items: center; width: 20%; min-width: 0; padding: 12rpx 2rpx; color: var(--yb-ink); font-size: 22rpx; gap: 12rpx; }
.category-item :deep(.wd-icon) { color: var(--yb-ink); }
.category-card--compact { padding: 10rpx 12rpx; }
.category-item--compact { flex: 1; flex-direction: row; justify-content: flex-start; width: auto; min-height: 76rpx; padding: 8rpx 16rpx; font-size: var(--yb-fs-body); gap: 14rpx; }
.category-item--compact text { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.category-item--compact :deep(.category-arrow) { flex-shrink: 0; color: var(--yb-muted); }

.section { margin: 32rpx 20rpx 0; padding: 24rpx; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-card); background: var(--yb-surface); }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.section-title-wrap { display: flex; align-items: center; min-width: 0; gap: 18rpx; }
.section-title { color: var(--yb-ink); font-size: var(--yb-fs-section-title); font-weight: 700; letter-spacing: -1rpx; }
.section-more { display: inline-flex; align-items: center; flex-shrink: 0; min-height: 80rpx; color: var(--yb-muted); font-size: var(--yb-fs-body-sm); gap: 4rpx; }
.countdown { display: inline-flex; align-items: center; color: var(--yb-brand); font-size: var(--yb-fs-caption); gap: 8rpx; white-space: nowrap; }
.timer { padding: 7rpx 10rpx; border-radius: 10rpx; background: var(--yb-brand); color: var(--yb-surface); font-family: var(--yb-font-mono); font-variant-numeric: tabular-nums; }
.flash-scroll { width: calc(100% + 48rpx); margin: 24rpx -24rpx -4rpx; white-space: nowrap; }
.flash-list { display: inline-flex; padding: 0 24rpx 6rpx; gap: 18rpx; }
.flash-product { display: inline-block; width: 272rpx; white-space: normal; vertical-align: top; }

.promo-grid { display: flex; margin: 24rpx 20rpx 0; gap: 16rpx; }
.promo-banner { position: relative; flex: 1; min-width: 0; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 24rpx; background: var(--yb-deep); box-shadow: var(--yb-shadow-card); }
.promo-image, .promo-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.promo-overlay { background: linear-gradient(180deg, rgba(15, 17, 26, .08) 20%, rgba(15, 17, 26, .78) 100%); }
.promo-copy { position: absolute; z-index: 1; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; padding: 20rpx; color: var(--yb-surface); gap: 5rpx; }
.promo-tag { align-self: flex-start; padding: 4rpx 10rpx; border-radius: var(--yb-radius-pill); background: rgba(255, 255, 255, .18); font-size: var(--yb-fs-micro); }
.promo-title { display: -webkit-box; overflow: hidden; font-size: var(--yb-fs-title-sm); font-weight: 700; line-height: 1.25; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.promo-subtitle { overflow: hidden; font-size: var(--yb-fs-caption); line-height: 30rpx; opacity: .84; text-overflow: ellipsis; white-space: nowrap; }

.product-section { padding-bottom: 20rpx; }
.product-grid { display: flex; flex-wrap: wrap; margin-top: 20rpx; gap: 16rpx; }
.product-grid :deep(.p-card), .product-skeleton { width: calc((100% - 16rpx) / 2); min-width: 0; box-sizing: border-box; }
.product-skeleton { aspect-ratio: .62; border-radius: var(--yb-radius-card); background: linear-gradient(100deg, #f2f3f5 20%, #fafafa 38%, #f2f3f5 56%); background-size: 200% 100%; animation: skeleton 1.4s ease infinite; }

@keyframes skeleton {
  to { background-position-x: -200%; }
}

.ai-entry { display: flex; align-items: center; min-height: 116rpx; margin: 24rpx 20rpx 32rpx; padding: 16rpx 18rpx 16rpx 24rpx; overflow: hidden; border: 1rpx solid #d9d9ff; border-radius: 20rpx; background: #f4f3ff; color: var(--yb-primary); gap: 12rpx; }
.ai-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 8rpx; }
.ai-copy text:first-child { font-size: var(--yb-fs-title-sm); font-weight: 700; }
.ai-copy text:last-child { color: var(--yb-muted); font-size: var(--yb-fs-body-sm); line-height: 34rpx; }
.ai-entry image { width: 126rpx; height: 92rpx; }

@media (max-width: 340px) {
  .hero-title { font-size: 38rpx; }
  .hero-actions { gap: 10rpx; }
  .hero-primary, .hero-secondary { min-width: 112rpx; padding: 0 12rpx; }
  .section-title-wrap { gap: 10rpx; }
  .countdown > text:first-child { display: none; }
}
</style>
