<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchCategoryTree } from '@/service/api/category';
import {
  fetchBestSellers,
  fetchFlashSale,
  fetchNewArrivals,
  fetchStorefrontRecommend
} from '@/service/api/product';
import { UI_ASSETS } from '@/constants/ui-assets';
import { formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';

interface CategoryNode {
  id: string;
  name: string;
}

type Product = Api.RealProduct.ProductDTO | Api.RealProduct.FlashSaleItemVO;

const loading = ref(true);
const categoryRoots = ref<CategoryNode[]>([]);
const recommended = ref<Api.RealProduct.ProductDTO[]>([]);
const hot = ref<Api.RealProduct.ProductDTO[]>([]);
const newest = ref<Api.RealProduct.ProductDTO[]>([]);
const flash = ref<Api.RealProduct.FlashSaleItemVO[]>([]);
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;

const categoryIcons = ['phone', 'shop', 'gift', 'cart', 'bags', 'star'];
const curated = computed(() => recommended.value.length ? recommended.value.slice(0, 4) : [...hot.value, ...newest.value].slice(0, 4));
const visibleCategories = computed(() => categoryRoots.value.slice(0, 6));

const countdown = computed(() => {
  const endTimes = flash.value
    .map(item => Number(item.sessionEndTime))
    .filter(value => Number.isFinite(value) && value > now.value);
  if (!endTimes.length) return '进行中';
  const seconds = Math.max(0, Math.floor((Math.min(...endTimes) - now.value) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(' : ');
});

function getProductImage(product: Product) {
  if ('image' in product && product.image) return product.image;
  if (!('images' in product)) return UI_ASSETS.placeholders.product;
  const first = product.images?.[0];
  return typeof first === 'string' ? first : UI_ASSETS.placeholders.product;
}

onMounted(async () => {
  loading.value = true;
  const results = await Promise.allSettled([
    fetchCategoryTree({ onlyEnabled: true }),
    fetchStorefrontRecommend(6),
    fetchBestSellers(1, 6),
    fetchNewArrivals(1, 6),
    fetchFlashSale(5)
  ]);
  const [categories, recommends, bestSellers, arrivals, flashSale] = results;
  if (categories.status === 'fulfilled') categoryRoots.value = categories.value;
  if (recommends.status === 'fulfilled') recommended.value = recommends.value;
  if (bestSellers.status === 'fulfilled') hot.value = bestSellers.value.records || [];
  if (arrivals.status === 'fulfilled') newest.value = arrivals.value.records || [];
  if (flashSale.status === 'fulfilled') {
    flash.value = flashSale.value;
    if (flash.value.length) countdownTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  }
  if (results.some(result => result.status === 'rejected')) {
    uni.showToast({ title: '部分首页数据加载失败', icon: 'none' });
  }
  loading.value = false;
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

function goCategory(id?: string | number) {
  go(`/pages/product/list${id ? `?categoryId=${encodeURIComponent(String(id))}` : ''}`);
}

function goProduct(id: string | number) {
  go(`/pages/product/detail?id=${encodeURIComponent(String(id))}&source=real`);
}

function goSearch() {
  go('/pages/product/list');
}

function goPurchase() {
  go('/pages/purchase/hall');
}
</script>

<template>
  <view class="home-page h5-tab-page">
    <view class="home-header">
      <view class="brand" @click="goSearch">
        <text class="brand-name">油宝</text>
        <text class="brand-mark">/</text>
      </view>
      <view class="search-entry yb-pressable" @click="goSearch">
        <wd-icon name="search" size="42rpx" />
        <text>搜索商品 / 买手</text>
      </view>
      <view class="message-entry yb-pressable" @click="go('/pages/message/index')">
        <wd-icon name="chat" size="48rpx" />
        <view class="notice-dot" />
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
      <view class="hero-pagination" aria-hidden="true">
        <text class="active" />
        <text /><text /><text />
      </view>
    </view>

    <view v-if="visibleCategories.length" class="category-card">
      <view
        v-for="(category, index) in visibleCategories"
        :key="category.id"
        class="category-item yb-pressable"
        @click="goCategory(category.id)"
      >
        <wd-icon :name="categoryIcons[index] || 'shop'" size="52rpx" />
        <text>{{ category.name }}</text>
      </view>
    </view>

    <view v-if="flash.length" class="section flash-section">
      <view class="section-head">
        <view class="section-title-wrap">
          <text class="section-title">限时秒杀</text>
          <view class="countdown"><text>距结束</text><text class="timer">{{ countdown }}</text></view>
        </view>
        <view class="section-more" @click="goSearch"><text>查看更多</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <scroll-view scroll-x class="flash-scroll" :show-scrollbar="false">
        <view class="flash-list">
          <view v-for="item in flash" :key="String(item.productId)" class="flash-product yb-pressable" @click="goProduct(item.productId)">
            <image :src="getProductImage(item)" mode="aspectFit" class="flash-image" />
            <text class="flash-name">{{ item.title }}</text>
            <view class="flash-price"><text>{{ formatUsdt(item.flashPrice) }}</text><text>{{ formatUsdt(item.price) }}</text></view>
          </view>
        </view>
      </scroll-view>
    </view>

    <view class="benefit-grid">
      <view class="benefit-card guarantee yb-pressable" @click="goPurchase">
        <view class="benefit-copy"><text>买手押金担保</text><text>平台托管 · 交易更安心</text><view>了解保障 <wd-icon name="arrow-right" size="24rpx" /></view></view>
        <image :src="UI_ASSETS.illustrations.homeGuarantee" mode="aspectFit" />
      </view>
      <view class="benefit-card vip yb-pressable" @click="go('/pages/vip/index')">
        <view class="benefit-copy"><text>成为 VIP</text><text>专属权益 · 更低手续费</text><view>立即开通 <wd-icon name="arrow-right" size="24rpx" /></view></view>
        <image :src="UI_ASSETS.illustrations.homeVip" mode="aspectFit" />
      </view>
    </view>

    <view v-if="curated.length || loading" class="section recommendation-section">
      <view class="section-head">
        <text class="section-title">为你推荐</text>
        <view class="section-more" @click="goSearch"><text>查看更多</text><wd-icon name="arrow-right" size="28rpx" /></view>
      </view>
      <view class="recommend-grid">
        <view v-for="product in curated" :key="String(product.id)" class="recommend-card yb-pressable" @click="goProduct(product.id)">
          <image :src="getProductImage(product)" mode="aspectFit" class="recommend-image" />
          <view class="recommend-copy">
            <text class="recommend-category">{{ product.categoryName || '油宝甄选' }}</text>
            <text class="recommend-name">{{ product.title }}</text>
            <text class="recommend-detail">{{ product.statusText || '认证买手 · 平台保障' }}</text>
            <text class="recommend-price">{{ formatUsdt(product.price) }}</text>
            <view class="recommend-meta"><text>{{ product.sellerName || '认证买手' }}</text><text>已售 {{ product.salesCount || 0 }}</text></view>
          </view>
        </view>
        <view v-if="loading" class="recommend-skeleton" />
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

.home-header {
  display: flex;
  align-items: center;
  min-height: 112rpx;
  padding: calc(env(safe-area-inset-top) + 16rpx) 32rpx 16rpx;
  background: var(--yb-surface);
  gap: 20rpx;
}

.brand { display: inline-flex; align-items: flex-end; flex-shrink: 0; }
.brand-name { color: var(--yb-ink); font-size: 56rpx; font-weight: 700; letter-spacing: -4rpx; line-height: 1; }
.brand-mark { margin: 0 0 2rpx 4rpx; color: var(--yb-brand); font-size: 34rpx; font-weight: 700; line-height: 1; }
.search-entry { display: flex; flex: 1; align-items: center; height: 72rpx; padding: 0 22rpx; border: 1rpx solid var(--yb-hairline-2); border-radius: var(--yb-radius-pill); color: var(--yb-muted); font-size: var(--yb-fs-body); gap: 14rpx; }
.message-entry { position: relative; display: flex; align-items: center; justify-content: center; width: 56rpx; height: 72rpx; color: var(--yb-ink); }
.notice-dot { position: absolute; top: 12rpx; right: 1rpx; width: 14rpx; height: 14rpx; border: 2rpx solid var(--yb-surface); border-radius: 50%; background: var(--yb-brand); }

.hero { position: relative; height: 352rpx; margin: 16rpx 20rpx 24rpx; overflow: hidden; border-radius: var(--yb-radius-card); background: var(--yb-deep); box-shadow: var(--yb-shadow-float); }
.hero-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-content { position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: center; width: 68%; height: 100%; padding: 34rpx 32rpx; color: var(--yb-surface); }
.hero-title { font-size: 42rpx; font-weight: 700; letter-spacing: -1.5rpx; line-height: 1.25; }
.hero-subtitle { margin-top: 12rpx; font-size: var(--yb-fs-body-sm); line-height: 36rpx; opacity: .9; }
.hero-actions { display: flex; margin-top: 22rpx; gap: 14rpx; }
.hero-primary, .hero-secondary { display: flex; align-items: center; justify-content: center; min-width: 132rpx; height: 58rpx; padding: 0 18rpx; border-radius: 18rpx; font-size: var(--yb-fs-body-sm); font-weight: 600; }
.hero-primary { background: var(--yb-brand); color: var(--yb-surface); }
.hero-secondary { border: 1rpx solid rgba(255, 255, 255, .78); color: var(--yb-surface); }
.hero-pagination { position: absolute; z-index: 2; right: 28rpx; bottom: 18rpx; display: flex; gap: 10rpx; }
.hero-pagination text { width: 20rpx; height: 6rpx; border-radius: var(--yb-radius-pill); background: rgba(255, 255, 255, .65); }
.hero-pagination .active { width: 28rpx; background: var(--yb-brand); }

.category-card { display: flex; margin: 0 20rpx; padding: 24rpx 8rpx; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-card); background: var(--yb-surface); box-shadow: var(--yb-shadow-card); }
.category-item { display: flex; flex: 1; flex-direction: column; align-items: center; min-width: 0; color: var(--yb-ink); font-size: 22rpx; gap: 16rpx; }
.category-item :deep(.wd-icon) { color: var(--yb-ink); }

.section { margin: 32rpx 20rpx 0; padding: 24rpx; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-card); background: var(--yb-surface); }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.section-title-wrap { display: flex; align-items: center; min-width: 0; gap: 18rpx; }
.section-title { color: var(--yb-ink); font-size: var(--yb-fs-section-title); font-weight: 700; letter-spacing: -1rpx; }
.section-more { display: inline-flex; align-items: center; flex-shrink: 0; color: var(--yb-muted); font-size: var(--yb-fs-body-sm); gap: 4rpx; }
.countdown { display: inline-flex; align-items: center; color: var(--yb-brand); font-size: var(--yb-fs-caption); gap: 8rpx; white-space: nowrap; }
.timer { padding: 7rpx 10rpx; border-radius: 10rpx; background: var(--yb-brand); color: var(--yb-surface); font-family: var(--yb-font-mono); font-variant-numeric: tabular-nums; }
.flash-scroll { width: calc(100% + 48rpx); margin: 24rpx -24rpx -4rpx; white-space: nowrap; }
.flash-list { display: inline-flex; padding: 0 24rpx 6rpx; gap: 18rpx; }
.flash-product { width: 136rpx; white-space: normal; }
.flash-image { width: 136rpx; height: 136rpx; padding: 10rpx; border-radius: 18rpx; background: #fbfbfb; }
.flash-name { display: -webkit-box; margin-top: 10rpx; overflow: hidden; color: var(--yb-ink-2); font-size: var(--yb-fs-caption); line-height: 30rpx; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.flash-price { display: flex; align-items: baseline; margin-top: 8rpx; gap: 7rpx; font-family: var(--yb-font-mono); font-variant-numeric: tabular-nums; }
.flash-price text:first-child { color: var(--yb-brand); font-size: var(--yb-fs-body); font-weight: 700; }
.flash-price text:last-child { color: var(--yb-faint); font-size: var(--yb-fs-micro); text-decoration: line-through; }

.benefit-grid { display: flex; margin: 24rpx 20rpx 0; gap: 16rpx; }
.benefit-card { position: relative; display: flex; flex: 1; min-width: 0; height: 154rpx; overflow: hidden; border-radius: 24rpx; }
.benefit-card image { position: absolute; right: -10rpx; bottom: 0; width: 148rpx; height: 146rpx; }
.benefit-copy { position: relative; z-index: 1; display: flex; flex-direction: column; min-width: 0; padding: 22rpx 16rpx; gap: 7rpx; }
.benefit-copy > text:first-child { font-size: 28rpx; font-weight: 700; }
.benefit-copy > text:nth-child(2) { font-size: 20rpx; line-height: 28rpx; }
.benefit-copy > view { display: inline-flex; align-items: center; width: fit-content; margin-top: 2rpx; padding: 4rpx 12rpx; border-radius: var(--yb-radius-pill); font-size: 18rpx; gap: 2rpx; }
.guarantee { background: var(--yb-champagne); color: var(--yb-gold); }
.guarantee .benefit-copy > text:nth-child(2) { color: #8f6e3e; }
.guarantee .benefit-copy > view { background: rgba(184, 147, 90, .16); }
.vip { background: var(--yb-deep); color: var(--yb-surface); }
.vip .benefit-copy > text:nth-child(2) { color: rgba(255, 255, 255, .78); }
.vip .benefit-copy > view { background: var(--yb-gold); color: var(--yb-deep); }

.recommendation-section { padding-bottom: 20rpx; }
.recommend-grid { display: flex; flex-wrap: wrap; margin-top: 20rpx; gap: 16rpx; }
.recommend-card { display: flex; width: calc((100% - 16rpx) / 2); min-width: 0; min-height: 254rpx; overflow: hidden; border-radius: 20rpx; background: #fbfbfb; }
.recommend-image { width: 44%; padding: 10rpx 0 10rpx 10rpx; }
.recommend-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; padding: 18rpx 12rpx; }
.recommend-category { align-self: flex-start; padding: 3rpx 8rpx; border-radius: 8rpx; background: var(--yb-champagne); color: var(--yb-gold); font-size: 18rpx; }
.recommend-name { display: -webkit-box; margin-top: 10rpx; overflow: hidden; color: var(--yb-ink); font-size: var(--yb-fs-body-sm); font-weight: 600; line-height: 32rpx; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.recommend-detail { display: -webkit-box; margin-top: 6rpx; overflow: hidden; color: var(--yb-muted); font-size: var(--yb-fs-micro); line-height: 28rpx; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
.recommend-price { margin-top: auto; color: var(--yb-brand); font-family: var(--yb-font-mono); font-size: var(--yb-fs-body); font-weight: 700; font-variant-numeric: tabular-nums; }
.recommend-meta { display: flex; justify-content: space-between; margin-top: 10rpx; color: var(--yb-muted); font-size: 18rpx; gap: 6rpx; }
.recommend-meta text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recommend-skeleton { width: calc((100% - 16rpx) / 2); min-height: 254rpx; border-radius: 20rpx; background: #f2f3f5; }

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
  .benefit-copy { padding-left: 12rpx; }
  .benefit-card image { width: 122rpx; }
}
</style>
