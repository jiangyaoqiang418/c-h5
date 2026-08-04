<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { enums, productApi, reviewApi } from '@shared';
import { avatarUrl, productImageUrl } from '@shared/utils/image';
import { formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { go, requireLogin } from '@/utils/navigate';
import { useCartStore } from '@/stores';
import VipBadge from '@/components/common/vip-badge.vue';
import ReviewStars from '@/components/common/review-stars.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';

const cart = useCartStore();
const product = ref<Api.Product.ProductRecord>();
const reviews = ref<Api.Review.ReviewRecord[]>([]);
const sellerScore = ref<Api.Review.UserScoreSummary>();
const qty = ref(1);

const aftersaleMeta = computed(() =>
  product.value ? enums.AFTERSALE_TYPE_META[product.value.aftersaleType] : undefined
);
const canBuy = computed(
  () => product.value && product.value.status === 'NORMAL' && product.value.shelfStatus === 'on-shelf' && product.value.stock > 0
);
const sellerAvatar = computed(() => (product.value ? avatarUrl(product.value.sellerId) : ''));

const images = computed(() => {
  if (!product.value?.images?.length) {
    return [productImageUrl(product.value?.id || 1, 720, product.value?.categoryPath)];
  }
  return product.value.images.map(i => i.url);
});

onLoad(async query => {
  const id = Number(query?.id);
  if (!id) return;
  product.value = await productApi.fetchProductDetail(id);
  if (product.value) {
    const [r, s] = await Promise.all([
      productApi.fetchProductReviews(product.value.id, 1, 5),
      reviewApi.fetchUserScoreSummary(product.value.sellerId)
    ]);
    reviews.value = r.records;
    sellerScore.value = s;
  }
});

function addToCart() {
  if (!product.value) return;
  cart.add(product.value.id, qty.value);
  uni.showToast({ title: '已加入购物车', icon: 'success' });
}

async function buyNow() {
  if (!product.value) return;
  cart.add(product.value.id, qty.value);
  if (await requireLogin(`/pages/product/detail?id=${product.value.id}`)) go('/pages/checkout/index');
}

function startPurchase() {
  if (!product.value) return;
  go(`/pages/purchase/create?productHint=${encodeURIComponent(product.value.title)}`);
}

function goBack() {
  uni.navigateBack();
}
</script>

<template>
  <view v-if="product" class="detail-page">
    <!-- 顶部返回 (glass) -->
    <view class="nav">
      <view class="nav-btn" @click="goBack">
        <view class="chev" />
      </view>
    </view>

    <!-- 沉浸式 swiper -->
    <view class="gallery-wrap">
      <swiper :indicator-dots="true" :autoplay="false" circular class="gallery" indicator-color="rgba(255,255,255,0.4)" indicator-active-color="#FFFFFF">
        <swiper-item v-for="(url, i) in images" :key="i">
          <image :src="url" mode="aspectFill" class="gallery-img" />
        </swiper-item>
      </swiper>
    </view>

    <!-- 内容 sheet (上抬覆盖) -->
    <view class="content-sheet">
      <!-- 品牌/类别 label -->
      <view class="brand-label">
        <text>📂 {{ product.categoryPath }}</text>
      </view>

      <!-- 标题 -->
      <text class="title">{{ product.title }}</text>
      <text class="summary">{{ product.summary }}</text>

      <!-- Rating summary -->
      <view v-if="sellerScore" class="rating-summary">
        <ReviewStars :score="Number(sellerScore.avgScore)" size="sm" show-score />
        <text class="rev-count">· {{ sellerScore.receivedTotal }} 评价</text>
      </view>

      <!-- 价格块 (USDT 主 / CNY 副 / 汇率) -->
      <view class="price-block">
        <view class="price-main">
          <text class="usdt-value">{{ priceSet(product.price).usdt }}</text>
          <view class="tag-live"><text>⚡ USDT</text></view>
        </view>
        <view class="price-sub">
          <text class="approx">≈ </text>
          <text class="cny-value">{{ priceSet(product.price).cny }}</text>
        </view>
        <view class="price-rate">
          <text>{{ priceSet(product.price).rateLabel }}</text>
        </view>
        <view class="price-fees">
          <view class="fee-item">运费 <text class="fee-num">{{ formatUsdt(product.shippingFee) }}</text></view>
          <text class="fee-sep"> | </text>
          <view class="fee-item">税费 <text class="fee-num">{{ formatUsdt(product.tax) }}</text><InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="24" /></view>
          <text class="fee-sep"> | </text>
          <view class="fee-item">库存 <text class="fee-num">{{ product.stock }} 件</text></view>
        </view>
      </view>

      <!-- Overseas warn -->
      <view v-if="product.overseasCustoms" class="overseas-warn">
        <text class="warn-icon">🌏</text>
        <view class="warn-text">
          <text class="warn-title">海外直邮商品</text>
          <text class="warn-sub">过关后不可退换，请认真挑选</text>
        </view>
      </view>

      <!-- Tag group -->
      <view class="tag-group">
        <view class="chip">
          <text>🛡️ {{ aftersaleMeta?.label }}</text>
        </view>
        <view class="chip">
          <text>📦 库存 {{ product.stock }}</text>
        </view>
        <view class="chip">
          <text>📈 销量 {{ product.salesCount || 0 }}</text>
        </view>
        <view class="chip">
          <text>❤️ 收藏 {{ product.favoriteCount || 0 }}</text>
        </view>
      </view>

      <!-- Seller Profile 卡 -->
      <view class="seller-card">
        <image :src="sellerAvatar" class="seller-avatar" />
        <view class="seller-info">
          <view class="seller-top">
            <text class="seller-name">{{ product.sellerName }}</text>
            <VipBadge level="VIP1" size="sm" />
            <view class="verified"><text>✓ 认证买手</text></view>
          </view>
          <view v-if="sellerScore" class="seller-stats">
            <text>⭐ {{ sellerScore.avgScore }} · {{ sellerScore.receivedTotal }} 评价 · 好评 {{ sellerScore.goodRate }}</text>
          </view>
        </view>
      </view>

      <!-- 用户评价 -->
      <view v-if="reviews.length" class="section">
        <view class="section-head">
          <text class="section-title">用户评价</text>
          <text class="section-count">共 {{ reviews.length }} 条</text>
        </view>
        <view v-for="r in reviews.slice(0, 3)" :key="r.id" class="review-mini">
          <view class="rev-head">
            <image :src="avatarUrl(r.fromUserId)" class="rev-avatar" />
            <text class="rev-name">{{ r.fromUserName }}</text>
            <ReviewStars :score="r.score" size="sm" />
          </view>
          <text class="rev-text">{{ r.content }}</text>
        </view>
      </view>

      <!-- 商品详情 -->
      <view class="section">
        <text class="section-title">商品详情</text>
        <text class="desc">{{ product.description || '暂无详情' }}</text>
      </view>

      <view class="footer-space" />
    </view>

    <!-- 底部固定操作栏 -->
    <view class="bottom-bar">
      <view class="ic-btn" @click="startPurchase">
        <text class="ic">✨</text>
        <text class="ic-lbl">求购</text>
      </view>
      <view class="ic-btn" @click="go('/pages/cart/index')">
        <text class="ic">🛒</text>
        <text class="ic-lbl">购物车</text>
      </view>
      <view class="qty-block">
        <text class="qty-btn" @click="qty = Math.max(1, qty - 1)">−</text>
        <text class="qty-val">{{ qty }}</text>
        <text class="qty-btn" @click="qty = Math.min(product.stock, qty + 1)">+</text>
      </view>
      <view class="cta-group">
        <view class="cta ghost" :class="{ disabled: !canBuy }" @click="canBuy && addToCart()">
          <text>加购</text>
        </view>
        <view class="cta primary" :class="{ disabled: !canBuy }" @click="canBuy && buyNow()">
          <text>立即购买</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.detail-page {
  min-height: 100vh;
  background: #FAFAF7;
  padding-bottom: 200rpx;
}
.nav {
  position: fixed;
  top: env(safe-area-inset-top);
  left: 0;
  z-index: 100;
  padding: 24rpx;
}
.nav-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20rpx);
  border: 1rpx solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4rpx 16rpx rgba(15, 17, 26, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.chev {
  position: relative;
  left: 4rpx;
  width: 28rpx;
  height: 28rpx;
  border-left: 5rpx solid #0F111A;
  border-bottom: 5rpx solid #0F111A;
  box-sizing: border-box;
  transform: rotate(45deg);
}

/* Gallery */
.gallery-wrap {
  position: relative;
}
.gallery {
  height: 750rpx;
  background: #EDECE6;
}
.gallery-img {
  width: 100%;
  height: 100%;
}

/* Content sheet (上抬) */
.content-sheet {
  position: relative;
  margin-top: -48rpx;
  background: #FFFFFF;
  border-radius: 40rpx 40rpx 0 0;
  padding: 40rpx 32rpx 32rpx;
  z-index: 2;
}
.brand-label {
  display: inline-block;
  padding: 6rpx 16rpx;
  background: #FAFAF7;
  border-radius: 999rpx;
  font-size: 20rpx;
  color: #6B7385;
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #0F111A;
  line-height: 1.3;
  letter-spacing: -1rpx;
}
.summary {
  display: block;
  font-size: 24rpx;
  color: #6B7385;
  margin-top: 8rpx;
  line-height: 1.5;
}
.rating-summary {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #6B7385;
}
.rev-count {
  font-size: 22rpx;
  color: #6B7385;
}

/* Price block */
.price-block {
  background: #F6EFE4;
  border: 1rpx solid rgba(184, 147, 90, 0.15);
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  margin-top: 24rpx;
}
.price-main {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.price-main .usdt-value {
  font-family: ui-monospace, monospace;
  font-size: 68rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -2rpx;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.price-sub {
  display: flex;
  align-items: baseline;
  margin-top: 12rpx;
  font-family: ui-monospace, monospace;
  font-size: 26rpx;
  color: #6B7385;
}
.price-sub .approx {
  color: #A8ADB8;
}
.price-sub .cny-value {
  color: #1D2129;
  font-weight: 600;
}
.price-rate {
  margin-top: 4rpx;
  font-family: ui-monospace, monospace;
  font-size: 20rpx;
  color: #A8ADB8;
  letter-spacing: -0.5rpx;
}
.tag-live {
  padding: 4rpx 14rpx;
  background: #0F111A;
  color: #D4A574;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  margin-left: 12rpx;
  align-self: center;
}
.price-fees {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid rgba(184, 147, 90, 0.2);
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #1D2129;
}
.fee-item {
  display: inline-flex;
  align-items: center;
  color: #6B7385;
}
.fee-num {
  font-family: ui-monospace, monospace;
  color: #1D2129;
  font-weight: 600;
  margin-left: 4rpx;
}
.fee-sep {
  color: rgba(184, 147, 90, 0.4);
}

/* Overseas warn */
.overseas-warn {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  background: rgba(231, 76, 60, 0.08);
  border-left: 6rpx solid #E74C3C;
  border-radius: 12rpx;
  margin-top: 20rpx;
}
.warn-icon {
  font-size: 36rpx;
}
.warn-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #E74C3C;
}
.warn-sub {
  display: block;
  font-size: 22rpx;
  color: #E74C3C;
  opacity: 0.86;
  margin-top: 4rpx;
}

/* Tag group */
.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}
.chip {
  padding: 8rpx 16rpx;
  background: #FAFAF7;
  border: 1rpx solid #EDECE6;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #1D2129;
}

/* Seller card */
.seller-card {
  margin-top: 32rpx;
  padding: 24rpx;
  background: #FAFAF7;
  border: 1rpx solid #EDECE6;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.seller-avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: #F6EFE4;
}
.seller-info { flex: 1; min-width: 0; }
.seller-top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.seller-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #0F111A;
}
.verified {
  padding: 4rpx 12rpx;
  background: rgba(0, 168, 138, 0.1);
  color: #00A88A;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 500;
}
.seller-stats {
  display: block;
  font-size: 22rpx;
  color: #6B7385;
  margin-top: 6rpx;
}

/* Section */
.section {
  margin-top: 40rpx;
  padding-top: 32rpx;
  border-top: 1rpx solid #EDECE6;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 20rpx;
}
.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.section-count {
  font-size: 22rpx;
  color: #6B7385;
}
.review-mini {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #EDECE6;
}
.review-mini:last-child {
  border-bottom: none;
}
.rev-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.rev-avatar {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: #F6EFE4;
}
.rev-name {
  font-size: 24rpx;
  font-weight: 600;
  color: #0F111A;
  flex: 1;
}
.rev-text {
  display: block;
  font-size: 24rpx;
  color: #1D2129;
  line-height: 1.6;
  padding-left: 60rpx;
}
.desc {
  display: block;
  font-size: 26rpx;
  color: #1D2129;
  line-height: 1.7;
  white-space: pre-wrap;
}
.footer-space { height: 40rpx; }

/* Bottom bar */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20rpx);
  border-top: 1rpx solid #EDECE6;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.ic-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4rpx 12rpx;
}
.ic {
  font-size: 36rpx;
}
.ic-lbl {
  font-size: 18rpx;
  color: #6B7385;
  margin-top: 2rpx;
}
.qty-block {
  display: flex;
  align-items: center;
  background: #FAFAF7;
  border: 1rpx solid #EDECE6;
  border-radius: 999rpx;
  margin-right: 8rpx;
}
.qty-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #0F111A;
}
.qty-val {
  min-width: 48rpx;
  text-align: center;
  font-size: 26rpx;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: #0F111A;
}
.cta-group {
  display: flex;
  gap: 8rpx;
  flex: 1;
}
.cta {
  flex: 1;
  padding: 20rpx 0;
  border-radius: 999rpx;
  text-align: center;
  font-size: 26rpx;
  font-weight: 600;
  transition: transform 0.15s;
}
.cta:active {
  transform: scale(0.97);
}
.cta.ghost {
  background: #FAFAF7;
  color: #0F111A;
  border: 1rpx solid #EDECE6;
}
.cta.primary {
  background: #0F111A;
  color: #FFFFFF;
}
.cta.disabled {
  opacity: 0.4;
}
</style>
