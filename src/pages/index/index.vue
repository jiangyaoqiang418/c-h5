<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { heroBrandImage } from '@shared/utils/image';
import { fetchCategoryTree } from '@/service/api/category';
import {
  fetchBanners,
  fetchBestSellers,
  fetchFlashSale,
  fetchNewArrivals,
  fetchStorefrontRecommend
} from '@/service/api/product';
import { go } from '@/utils/navigate';
import ProductCard from '@/components/product/product-card.vue';

interface CategoryNode { id: string; name: string; }

const loading = ref(true);
const categoryRoots = ref<CategoryNode[]>([]);
const recommended = ref<Api.RealProduct.ProductDTO[]>([]);
const hot = ref<Api.RealProduct.ProductDTO[]>([]);
const newest = ref<Api.RealProduct.ProductDTO[]>([]);
const flash = ref<Api.RealProduct.ProductDTO[]>([]);
const flashItems = ref<Api.RealProduct.FlashSaleItemVO[]>([]);
const promoBanners = ref<Api.RealProduct.BannerDTO[]>([]);
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | undefined;

const heroImage = heroBrandImage('luxury', 900);

const categoryIcons = ['📱', '💻', '⌚️', '👜', '👟', '🧴', '🍱', '🎮', '📷', '🚲'];

const countdown = computed(() => {
  const endTimes = flashItems.value
    .map(item => Number(item.sessionEndTime))
    .filter(value => Number.isFinite(value) && value > now.value);
  if (!endTimes.length) return '进行中';
  const seconds = Math.max(0, Math.floor((Math.min(...endTimes) - now.value) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
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

onMounted(async () => {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      fetchCategoryTree({ onlyEnabled: true }),
      fetchStorefrontRecommend(6),
      fetchBestSellers(1, 6),
      fetchNewArrivals(1, 6),
      fetchFlashSale(4),
      fetchBanners()
    ]);
    const [cats, recommends, bestSellers, arrivals, flashSale, banners] = results;
    if (cats.status === 'fulfilled') categoryRoots.value = cats.value.slice(0, 10);
    if (recommends.status === 'fulfilled') recommended.value = recommends.value;
    if (bestSellers.status === 'fulfilled') hot.value = bestSellers.value.records || [];
    if (arrivals.status === 'fulfilled') newest.value = arrivals.value.records || [];
    if (flashSale.status === 'fulfilled') {
      flashItems.value = flashSale.value;
      flash.value = flashSale.value.map(toFlashProduct);
      if (flashItems.value.length) countdownTimer = setInterval(() => { now.value = Date.now(); }, 1000);
    }
    if (banners.status === 'fulfilled') {
      promoBanners.value = banners.value.filter(item => item.enabled !== false).slice(0, 2);
    }
    if (results.some(result => result.status === 'rejected')) {
      uni.showToast({ title: '部分首页数据加载失败', icon: 'none' });
    }
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '首页数据加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

function goCategory(id?: string | number) { go(`/pages/product/list${id ? `?categoryId=${encodeURIComponent(String(id))}` : ''}`); }
function goSearch() { go('/pages/product/list'); }
function goAi() { go('/pages/ai/index'); }
function goPurchase() { go('/pages/purchase/hall'); }
function goBanner(path?: string) {
  if (path?.startsWith('/pages/')) go(path);
  else goSearch();
}
</script>

<template>
  <view class="home-page h5-tab-page">
    <!-- ============ 顶部搜索栏 ============ -->
    <view class="top-bar">
      <view class="logo-wrap">
        <text class="logo-mark">油宝</text>
      </view>
      <view class="search-bar" @click="goSearch">
        <text class="search-icon">🔍</text>
        <text class="search-ph">搜索商品 / 买手</text>
      </view>
    </view>

    <!-- ============ Hero editorial ============ -->
    <view class="hero-wrap">
      <image :src="heroImage" mode="aspectFill" class="hero-img" />
      <view class="hero-overlay"></view>
      <view class="hero-content">
        <view class="hero-eyebrow">
          <text class="dot"></text>
          <text>油宝 · Web3 USDT 跨境代购</text>
        </view>
        <view class="hero-title">高级选品
          <text class="accent">链上撮合</text>
        </view>
        <text class="hero-sub">全球买手 24h 内响应 · 押金担保售后无忧</text>
        <view class="hero-ctas">
          <view class="btn-primary" @click="goSearch">探索商品 →</view>
          <view class="btn-ghost" @click="goPurchase">✨ 发起求购</view>
        </view>
      </view>
    </view>

    <!-- ============ 分类 grid ============ -->
    <view class="cat-grid">
      <view
        v-for="(c, i) in categoryRoots"
        :key="c.id"
        class="cat-cell"
        @click="goCategory(c.id)"
      >
        <view class="cat-icon-wrap">
          <text class="cat-emoji">{{ categoryIcons[i] || '📦' }}</text>
        </view>
        <text class="cat-name">{{ c.name }}</text>
      </view>
    </view>

    <!-- ============ 限时秒杀 ============ -->
    <view v-if="flash.length" class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag flash">
            <text>🔥 LIMITED</text>
          </view>
          <text class="section-title">限时秒杀</text>
        </view>
        <view class="countdown">
          <text>⏱ {{ countdown }}</text>
        </view>
      </view>
      <scroll-view scroll-x class="flash-scroll">
        <view class="flash-row">
          <view v-for="p in flash" :key="p.id" class="flash-item">
            <ProductCard :product="p" />
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ============ 双 promo banner ============ -->
    <view v-if="promoBanners.length" class="promo-grid">
      <view
        v-for="(b) in promoBanners"
        :key="String(b.id)"
        class="promo-banner"
        :style="{ backgroundImage: `url(${b.image})` }"
        @click="goBanner(b.pathTo)"
      >
        <view class="promo-overlay"></view>
        <view class="promo-content">
          <text class="promo-eyebrow">{{ b.tag }}</text>
          <text class="promo-title">{{ b.title }}</text>
          <text class="promo-sub">{{ b.subtitle }}</text>
        </view>
      </view>
    </view>

    <!-- ============ 为你推荐 ============ -->
    <view v-if="recommended.length" class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag recommend"><text>FOR YOU</text></view>
          <text class="section-title">为你推荐</text>
        </view>
      </view>
      <view class="grid">
        <ProductCard v-for="p in recommended" :key="String(p.id)" :product="p" />
      </view>
    </view>

    <!-- ============ 热销榜 ============ -->
    <view v-if="hot.length" class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag hot"><text>TOP SALES</text></view>
          <text class="section-title">热销榜</text>
        </view>
        <text class="more" @click="goSearch">查看全部 →</text>
      </view>
      <view class="grid">
        <ProductCard v-for="p in hot" :key="p.id" :product="p" />
      </view>
    </view>

    <!-- ============ 新品 ============ -->
    <view v-if="newest.length" class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag new"><text>✨ NEW</text></view>
          <text class="section-title">新品直邮</text>
        </view>
        <text class="more" @click="goSearch">查看全部 →</text>
      </view>
      <view class="grid">
        <ProductCard v-for="p in newest" :key="p.id" :product="p" />
      </view>
    </view>

    <!-- ============ AI banner ============ -->
    <view class="ai-banner" @click="goAi">
      <view class="ai-glow"></view>
      <view class="ai-content">
        <view class="ai-icon-wrap">
          <text class="ai-icon">✨</text>
        </view>
        <view class="ai-text">
          <text class="ai-eyebrow">AI · POWERED BY LLM</text>
          <text class="ai-title">告诉我你想买什么</text>
          <text class="ai-sub">找不到？一键发起求购</text>
        </view>
        <text class="ai-arrow">→</text>
      </view>
    </view>

  </view>
</template>

<style lang="scss" scoped>
.home-page {
  min-height: 100%;
  background: #FAFAF7;
}

/* ========== 顶部 ========== */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  padding: calc(env(safe-area-inset-top) + 16rpx) 32rpx 16rpx;
  background: #FFFFFF;
  border-bottom: 1rpx solid #EDECE6;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.1);
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.logo-wrap {
  flex-shrink: 0;
}
.logo-mark {
  display: inline-block;
  padding: 8rpx 20rpx;
  background: #0F111A;
  color: #FFFFFF;
  border-radius: 12rpx;
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.search-bar {
  flex: 1;
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 999rpx;
  padding: 16rpx 28rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: #6B7385;
}
.search-icon {
  font-size: 26rpx;
}
.search-ph {
  font-size: 24rpx;
}

/* ========== Hero ========== */
.hero-wrap {
  position: relative;
  height: 720rpx;
  margin: 24rpx 32rpx;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 12rpx 40rpx rgba(15, 17, 26, 0.08);
}
.hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 17, 26, 0.1) 0%, rgba(15, 17, 26, 0.7) 100%);
}
.hero-content {
  position: absolute;
  inset: 0;
  padding: 48rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12rpx;
  color: #FFFFFF;
}
.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 8rpx 20rpx;
  background: rgba(15, 17, 26, 0.32);
  border: 1rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  align-self: flex-start;
}
.dot {
  display: block;
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #B8935A;
}
.hero-title {
  font-size: 72rpx;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -2rpx;
  margin-top: 16rpx;
}
.accent {
  color: #D4A574;
}
.hero-sub {
  font-size: 24rpx;
  opacity: 0.9;
  margin-top: 12rpx;
  max-width: 500rpx;
  line-height: 1.5;
}
.hero-ctas {
  display: flex;
  gap: 16rpx;
  margin-top: 32rpx;
}
.btn-primary {
  padding: 20rpx 36rpx;
  background: #FFFFFF;
  color: #0F111A;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 600;
}
.btn-ghost {
  padding: 20rpx 32rpx;
  background: transparent;
  color: #FFFFFF;
  border: 1rpx solid rgba(255, 255, 255, 0.4);
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 500;
}

/* ========== 分类 grid ========== */
.cat-grid {
  background: #FFFFFF;
  margin: 0 32rpx;
  border-radius: 24rpx;
  padding: 24rpx 12rpx;
  border: 1rpx solid #EDECE6;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.04);
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx 12rpx;
}
.cat-cell {
  width: calc((100% - 48rpx) / 5);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx;
}
.cat-cell:active {
  opacity: 0.7;
}
.cat-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  background: #F6EFE4;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cat-emoji {
  font-size: 44rpx;
}
.cat-name {
  font-size: 22rpx;
  color: #1D2129;
  font-weight: 500;
}

/* ========== Section ========== */
.section {
  margin: 32rpx 32rpx 0;
}
.section-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 4rpx;
  margin-bottom: 12rpx;
}
.title-group {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.sec-tag {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.sec-tag.flash { background: rgba(231, 76, 60, 0.1); color: #E74C3C; }
.sec-tag.recommend { background: rgba(77, 128, 240, 0.1); color: #4D80F0; }
.sec-tag.hot   { background: rgba(91, 92, 231, 0.1); color: #5B5CE7; }
.sec-tag.new   { background: rgba(0, 168, 138, 0.1); color: #00A88A; }
.section-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
}
.countdown {
  padding: 6rpx 16rpx;
  background: rgba(231, 76, 60, 0.1);
  color: #E74C3C;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
.more {
  font-size: 24rpx;
  color: #6B7385;
}
.flash-scroll {
  white-space: nowrap;
}
.flash-row {
  display: inline-flex;
  gap: 16rpx;
  padding: 4rpx 0;
}
.flash-item {
  display: inline-block;
  width: 320rpx;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.grid > * { width: calc((100% - 20rpx) / 2); min-width: 0; }

/* ========== Promo banners ========== */
.promo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin: 32rpx;
}
.promo-banner {
  width: calc((100% - 16rpx) / 2);
  box-sizing: border-box;
  position: relative;
  aspect-ratio: 4 / 5;
  border-radius: 24rpx;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}
.promo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 17, 26, 0.2) 0%, rgba(15, 17, 26, 0.72) 100%);
}
.promo-content {
  position: absolute;
  inset: 0;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: #FFFFFF;
  gap: 6rpx;
}
.promo-eyebrow {
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  opacity: 0.85;
}
.promo-title {
  font-size: 34rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
  line-height: 1.2;
}
.promo-sub {
  font-size: 22rpx;
  opacity: 0.88;
}

/* ========== AI banner ========== */
.ai-banner {
  position: relative;
  margin: 32rpx 32rpx 40rpx;
  padding: 40rpx 32rpx;
  background: linear-gradient(135deg, #0F1B36 0%, #1E1F3A 60%, #5B5CE7 100%);
  border-radius: 32rpx;
  overflow: hidden;
}
.ai-glow {
  position: absolute;
  top: -50%;
  right: -20%;
  width: 500rpx;
  height: 500rpx;
  background: radial-gradient(circle, rgba(184, 147, 90, 0.28) 0%, transparent 70%);
  border-radius: 50%;
}
.ai-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.ai-icon-wrap {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.12);
  border: 1rpx solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-icon {
  font-size: 44rpx;
}
.ai-text {
  flex: 1;
}
.ai-eyebrow {
  display: block;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  color: #D4A574;
  margin-bottom: 4rpx;
}
.ai-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: -0.5rpx;
}
.ai-sub {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 2rpx;
}
.ai-arrow {
  font-size: 36rpx;
  color: #FFFFFF;
}
</style>
