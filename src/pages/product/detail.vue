<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { productApi, reviewApi } from '@shared';
import { avatarUrl } from '@shared/utils/image';
import { formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchStorefrontProductDetail, recordProductBrowse } from '@/service/api/product';
import { go, requireLogin } from '@/utils/navigate';
import { useCartStore } from '@/stores';
import VipBadge from '@/components/common/vip-badge.vue';
import ReviewStars from '@/components/common/review-stars.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';

interface ProductView {
  id: string | number;
  legacyId?: number;
  title: string;
  sellerId: string | number;
  sellerName: string;
  categoryPath: string;
  price: string | number;
  shippingFee: string | number;
  tax: string | number;
  stock: number;
  images: string[];
  summary: string;
  description: string;
  aftersaleType: Api.Product.AftersaleType;
  overseasCustoms: boolean;
  status: Api.Product.ProductStatus;
  shelfStatus: Api.Product.ShelfStatus;
  salesCount: string | number;
  favoriteCount: string | number;
}

const cart = useCartStore();
const product = ref<ProductView>();
const reviews = ref<Api.Review.ReviewRecord[]>([]);
const sellerScore = ref<Api.Review.UserScoreSummary>();
const qty = ref(1);
const isRealProduct = ref(false);

function toAfterSaleType(value?: string): Api.Product.AftersaleType {
  if (value === 'NONE') return 'none';
  if (value === 'SHOP_WARRANTY') return 'shop-warranty';
  if (value === 'NATIONAL_WARRANTY') return 'national-warranty';
  return '7day-no-reason';
}

function categoryPathOf(nodes: CategoryNode[], id: string | number, parents: string[] = []): string | undefined {
  for (const node of nodes) {
    const path = [...parents, node.name];
    if (String(node.id) === String(id)) return path.join(' / ');
    const childPath = categoryPathOf(node.children || [], id, path);
    if (childPath) return childPath;
  }
  return undefined;
}

function fromMock(record: Api.Product.ProductRecord): ProductView {
  return {
    id: record.id,
    legacyId: record.id,
    title: record.title,
    sellerId: record.sellerId,
    sellerName: record.sellerName,
    categoryPath: record.categoryPath,
    price: record.price,
    shippingFee: record.shippingFee,
    tax: record.tax,
    stock: record.stock,
    images: record.images.map(item => item.url),
    summary: record.summary,
    description: record.description,
    aftersaleType: record.aftersaleType,
    overseasCustoms: !!record.overseasCustoms,
    status: record.status,
    shelfStatus: record.shelfStatus,
    salesCount: record.salesCount,
    favoriteCount: record.favoriteCount
  };
}

function fromReal(record: Api.RealProduct.ProductDTO, categoryPath: string): ProductView {
  return {
    id: record.id,
    title: record.title,
    sellerId: record.sellerId,
    sellerName: '认证买手',
    categoryPath,
    price: record.price,
    shippingFee: record.shippingFee || 0,
    tax: record.taxFee || 0,
    stock: record.stock,
    images: record.images || [],
    summary: record.brief || '',
    description: record.description || '',
    aftersaleType: toAfterSaleType(record.afterSaleType),
    overseasCustoms: !!record.overseasClearance,
    status: record.status === 'ON_SALE' ? 'NORMAL' : 'FROZEN',
    shelfStatus: record.status === 'ON_SALE' ? 'on-shelf' : 'off-shelf',
    salesCount: record.salesCount || 0,
    favoriteCount: record.favoriteCount || 0
  };
}

const aftersaleLabel = computed(() => {
  const labels: Record<Api.Product.AftersaleType, string> = {
    none: '无售后',
    '7day-no-reason': '7天无理由',
    'shop-warranty': '店铺保修',
    'national-warranty': '全国联保'
  };
  return product.value ? labels[product.value.aftersaleType] : '';
});
const canAdd = computed(() => (
  product.value?.status === 'NORMAL'
  && product.value.shelfStatus === 'on-shelf'
  && product.value.stock > 0
));
const canBuy = computed(() => canAdd.value && !isRealProduct.value);
const sellerAvatar = computed(() => (
  !isRealProduct.value && product.value?.legacyId ? avatarUrl(product.value.legacyId) : ''
));

onLoad(async query => {
  const rawId = String(query?.id || '');
  if (!rawId) return;
  isRealProduct.value = query?.source === 'real';
  try {
    if (isRealProduct.value) {
      const [recordResult, categoriesResult] = await Promise.allSettled([
        fetchStorefrontProductDetail(rawId),
        fetchCategoryTree({ onlyEnabled: true })
      ]);
      if (recordResult.status === 'rejected') throw recordResult.reason;
      const record = recordResult.value;
      const categoryPath = categoriesResult.status === 'fulfilled'
        ? categoryPathOf(categoriesResult.value, record.categoryId)
        : undefined;
      product.value = fromReal(record, categoryPath || `分类 ${record.categoryId}`);
      recordProductBrowse(rawId).catch(() => undefined);
      return;
    }

    const mockId = Number(rawId);
    if (!Number.isSafeInteger(mockId)) return;
    const record = await productApi.fetchProductDetail(mockId);
    if (!record) return;
    product.value = fromMock(record);
    const [reviewPage, score] = await Promise.all([
      productApi.fetchProductReviews(record.id, 1, 5),
      reviewApi.fetchUserScoreSummary(record.sellerId)
    ]);
    reviews.value = reviewPage.records;
    sellerScore.value = score;
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '商品详情加载失败', icon: 'none' });
  }
});

function addToCart() {
  if (!product.value) return;
  if (isRealProduct.value) {
    cart.addReal({
      id: product.value.id,
      title: product.value.title,
      sellerId: product.value.sellerId,
      sellerName: product.value.sellerName,
      cover: product.value.images[0],
      price: product.value.price,
      shippingFee: product.value.shippingFee,
      tax: product.value.tax,
      stock: product.value.stock,
      aftersaleType: product.value.aftersaleType,
      overseasCustoms: product.value.overseasCustoms
    }, qty.value);
  } else if (product.value.legacyId) {
    cart.add(product.value.legacyId, qty.value);
  } else {
    return;
  }
  uni.showToast({ title: '已加入购物车', icon: 'success' });
}

async function buyNow() {
  if (!product.value?.legacyId) return showTradeUnavailable();
  cart.add(product.value.legacyId, qty.value);
  if (await requireLogin(`/pages/product/detail?id=${product.value.legacyId}`)) go('/pages/checkout/index');
}

function showTradeUnavailable() {
  uni.showToast({ title: '该商品暂不支持结算', icon: 'none' });
}

function startPurchase() {
  if (product.value) go(`/pages/purchase/create?productHint=${encodeURIComponent(product.value.title)}`);
}

function goBack() {
  uni.navigateBack();
}
</script>

<template>
  <view v-if="product" class="detail-page">
    <view class="nav"><view class="nav-btn" @click="goBack"><view class="chev" /></view></view>

    <swiper :indicator-dots="true" :autoplay="false" circular class="gallery" indicator-active-color="#FFFFFF">
      <swiper-item v-for="(url, index) in product.images" :key="`${url}-${index}`">
        <image :src="url" mode="aspectFill" class="gallery-image" />
      </swiper-item>
      <swiper-item v-if="!product.images.length"><view class="gallery-empty">暂无图片</view></swiper-item>
    </swiper>

    <view class="content-sheet">
      <text class="category">{{ product.categoryPath }}</text>
      <text class="title">{{ product.title }}</text>
      <text v-if="product.summary" class="summary">{{ product.summary }}</text>

      <view v-if="sellerScore" class="rating-summary">
        <ReviewStars :score="Number(sellerScore.avgScore)" size="sm" show-score />
        <text>· {{ sellerScore.receivedTotal }} 评价</text>
      </view>

      <view class="price-block">
        <text class="price-main">{{ priceSet(product.price).usdt }}</text>
        <text class="price-sub">≈ {{ priceSet(product.price).cny }}</text>
        <view class="fee-row">
          <text>运费 {{ formatUsdt(product.shippingFee) }}</text>
          <text>税费 {{ formatUsdt(product.tax) }}<InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="24" /></text>
          <text>库存 {{ product.stock }}</text>
        </view>
      </view>

      <view v-if="product.overseasCustoms" class="overseas-warn">海外直邮商品，过关后不可退换</view>

      <view class="tag-row">
        <text class="tag">{{ aftersaleLabel }}</text>
        <text class="tag">销量 {{ product.salesCount }}</text>
        <text class="tag">收藏 {{ product.favoriteCount }}</text>
      </view>

      <view class="seller-section">
        <image v-if="sellerAvatar" :src="sellerAvatar" class="seller-avatar" />
        <view v-else class="seller-avatar placeholder">买</view>
        <view class="seller-info">
          <view class="seller-head"><text class="seller-name">{{ product.sellerName }}</text><VipBadge level="VIP1" size="sm" /></view>
          <text class="seller-sub">平台认证买手</text>
        </view>
      </view>

      <view v-if="reviews.length" class="section">
        <text class="section-title">用户评价</text>
        <view v-for="review in reviews.slice(0, 3)" :key="review.id" class="review-row">
          <view class="review-head"><text>{{ review.fromUserName }}</text><ReviewStars :score="review.score" size="sm" /></view>
          <text class="review-text">{{ review.content }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">商品详情</text>
        <text class="description">{{ product.description || '暂无详情' }}</text>
      </view>
    </view>

    <view class="bottom-bar">
      <view class="tool" @click="startPurchase"><text class="tool-icon">✨</text><text>求购</text></view>
      <view class="tool" @click="go('/pages/cart/index')"><text class="tool-icon">🛒</text><text>购物车</text></view>
      <view class="quantity">
        <text @click="qty = Math.max(1, qty - 1)">−</text><text>{{ qty }}</text><text @click="qty = Math.min(product.stock, qty + 1)">+</text>
      </view>
      <wd-button plain :disabled="!canAdd" @click="canAdd ? addToCart() : showTradeUnavailable()">加购</wd-button>
      <wd-button type="primary" :disabled="!canBuy" @click="canBuy ? buyNow() : showTradeUnavailable()">{{ isRealProduct ? '订单接入中' : '立即购买' }}</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100vh; padding-bottom: 180rpx; background: #fafaf7; }
.nav { position: fixed; top: env(safe-area-inset-top); left: 0; z-index: 20; padding: 24rpx; }
.nav-btn { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; border-radius: 50%; background: rgba(255,255,255,0.92); }
.chev { width: 24rpx; height: 24rpx; border-left: 5rpx solid #0f111a; border-bottom: 5rpx solid #0f111a; transform: rotate(45deg); }
.gallery { height: 750rpx; background: #edece6; }
.gallery-image { width: 100%; height: 100%; }
.gallery-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #86909c; font-size: 24rpx; }
.content-sheet { position: relative; z-index: 2; margin-top: -48rpx; padding: 40rpx 32rpx; border-radius: 40rpx 40rpx 0 0; background: #fff; }
.category { display: inline-block; padding: 6rpx 16rpx; border-radius: 8rpx; background: #fafaf7; color: #6b7385; font-size: 20rpx; }
.title { display: block; margin-top: 16rpx; color: #0f111a; font-size: 40rpx; font-weight: 700; line-height: 1.35; }
.summary { display: block; margin-top: 8rpx; color: #6b7385; font-size: 24rpx; line-height: 1.5; }
.rating-summary { display: flex; align-items: center; gap: 8rpx; margin-top: 16rpx; color: #6b7385; font-size: 22rpx; }
.price-block { margin-top: 24rpx; padding: 28rpx; border-radius: 16rpx; background: #f6efe4; }
.price-main { display: block; color: #0f111a; font-size: 60rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.price-sub { display: block; margin-top: 8rpx; color: #6b7385; font-size: 24rpx; }
.fee-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid rgba(184,147,90,0.2); color: #6b7385; font-size: 22rpx; }
.overseas-warn { margin-top: 20rpx; padding: 20rpx; border-left: 6rpx solid #e74c3c; border-radius: 8rpx; background: rgba(231,76,60,0.08); color: #e74c3c; font-size: 24rpx; }
.tag-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 24rpx; }
.tag { padding: 8rpx 16rpx; border: 1rpx solid #edece6; border-radius: 8rpx; background: #fafaf7; color: #1d2129; font-size: 22rpx; }
.seller-section { display: flex; align-items: center; gap: 20rpx; margin-top: 32rpx; padding: 24rpx; border: 1rpx solid #edece6; border-radius: 16rpx; background: #fafaf7; }
.seller-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: #f6efe4; }
.seller-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #b8935a; font-size: 32rpx; font-weight: 700; }
.seller-info { flex: 1; }
.seller-head { display: flex; align-items: center; gap: 12rpx; }
.seller-name { font-size: 28rpx; font-weight: 700; color: #0f111a; }
.seller-sub { display: block; margin-top: 6rpx; color: #6b7385; font-size: 22rpx; }
.section { margin-top: 36rpx; padding-top: 28rpx; border-top: 1rpx solid #edece6; }
.section-title { display: block; margin-bottom: 16rpx; color: #0f111a; font-size: 30rpx; font-weight: 700; }
.review-row { padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.review-head { display: flex; align-items: center; justify-content: space-between; font-size: 24rpx; }
.review-text, .description { display: block; margin-top: 8rpx; color: #1d2129; font-size: 24rpx; line-height: 1.7; white-space: pre-wrap; }
.bottom-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: flex; align-items: center; gap: 10rpx; padding: 14rpx 20rpx calc(14rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #edece6; background: #fff; }
.tool { display: flex; flex-direction: column; align-items: center; min-width: 72rpx; color: #6b7385; font-size: 18rpx; }
.tool-icon { font-size: 30rpx; }
.quantity { display: flex; align-items: center; gap: 18rpx; padding: 12rpx 16rpx; border-radius: 8rpx; background: #fafaf7; font-size: 24rpx; }
</style>
