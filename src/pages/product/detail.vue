<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { formatUsdt, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { favoriteProduct, fetchStorefrontProductDetail, recordProductBrowse } from '@/service/api/product';
import { fetchReviewSummary, fetchSellerRating, fetchStorefrontReviews } from '@/service/api/review';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useCartStore } from '@/stores';
import ReviewStars from '@/components/common/review-stars.vue';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import EmptyState from '@/components/common/empty-state.vue';
import RichTextContent from '@/components/common/rich-text-content.vue';
import PriceTag from '@/components/common/price-tag.vue';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();

interface ProductView {
  id: string | number;
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
  aftersaleType: Api.Product.AftersaleType | 'unknown';
  overseasCustoms: boolean;
  status: Api.Product.ProductStatus;
  shelfStatus: Api.Product.ShelfStatus;
  salesCount: string | number;
  favoriteCount: string | number;
}

const cart = useCartStore();
const product = ref<ProductView>();
const realReviews = ref<Api.RealReview.ReviewDTO[]>([]);
const realReviewSummary = ref<Api.RealReview.ReviewSummaryDTO>();
const realSellerRating = ref<Api.RealReview.SellerRatingDTO>();
const reviewLoadFailed = ref(false);
const failedImages = ref<string[]>([]);
const qty = ref(1);
const isRealProduct = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
const buying = ref(false);
const favoriting = ref(false);
const detailId = ref('');
const loadedOnce = ref(false);
let pageActive = true;
let pageVersion = 0;
onShow(() => { pageActive = true; buying.value = false; if (loadedOnce.value && detailId.value) void loadDetail(); });
onHide(() => { pageActive = false; pageVersion++; });
onUnload(() => { pageActive = false; pageVersion++; });

function toAfterSaleType(value?: string): ProductView['aftersaleType'] {
  if (value === 'NONE') return 'none';
  if (value === 'SHOP_WARRANTY') return 'shop-warranty';
  if (value === 'NATIONAL_WARRANTY') return 'national-warranty';
  if (value === 'SEVEN_DAY_NO_REASON') return '7day-no-reason';
  return 'unknown';
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

function fromReal(record: Api.RealProduct.ProductDTO, categoryPath?: string): ProductView {
  return {
    id: record.id,
    title: record.title,
    sellerId: record.sellerId,
    sellerName: record.sellerName || '买手信息待完善',
    categoryPath: categoryPath || record.categoryName || `分类 ${record.categoryId}`,
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
  const labels: Record<ProductView['aftersaleType'], string> = {
    none: '无售后',
    '7day-no-reason': '7天无理由',
    'shop-warranty': '店铺保修',
    'national-warranty': '全国联保',
    unknown: '售后规则以订单页为准'
  };
  return product.value ? labels[product.value.aftersaleType] : '';
});
const canAdd = computed(() => (
  isRealProduct.value
  && product.value?.status === 'NORMAL'
  && product.value.shelfStatus === 'on-shelf'
  && product.value.stock > 0
  && product.value.aftersaleType !== 'unknown'
));
const canBuy = computed(() => canAdd.value);
const tradeNotice = computed(() => {
  if (!product.value) return '';
  if (product.value.status !== 'NORMAL' || product.value.shelfStatus !== 'on-shelf') return '商品当前不可购买，请查看其他商品。';
  if (product.value.stock <= 0) return '商品已售罄，暂时无法加购或购买。';
  if (product.value.aftersaleType === 'unknown') return '商品售后信息暂不完整，当前无法结算。';
  return '';
});

async function loadDetail() {
  const rawId = detailId.value;
  if (!isRealProduct.value || !rawId) {
    loading.value = false;
    return;
  }
  const version = ++pageVersion;
  const current = () => pageActive && version === pageVersion;
  loading.value = true;
  loadFailed.value = false;
  try {
    if (isRealProduct.value) {
      const [recordResult, categoriesResult] = await Promise.allSettled([
        fetchStorefrontProductDetail(rawId),
        fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: true })
      ]);
      if (recordResult.status === 'rejected') throw recordResult.reason;
      if (!current()) return;
      const record = recordResult.value;
      const categoryPath = categoriesResult.status === 'fulfilled'
        ? categoryPathOf(categoriesResult.value, record.categoryId)
        : undefined;
      product.value = fromReal(record, categoryPath);
      qty.value = Math.max(1, Math.min(qty.value, Math.max(1, record.stock)));
      if (!loadedOnce.value) recordProductBrowse(rawId).catch(() => undefined);
      const reviewResults = await Promise.allSettled([
        fetchStorefrontReviews({ productId: rawId, pageSize: 3 }),
        fetchReviewSummary(rawId),
        fetchSellerRating(record.sellerId)
      ]);
      const [reviewPage, summary, sellerRating] = reviewResults;
      if (!current()) return;
      reviewLoadFailed.value = reviewResults.some(result => result.status === 'rejected');
      realReviews.value = reviewPage.status === 'fulfilled' ? reviewPage.value.records : [];
      realReviewSummary.value = summary.status === 'fulfilled' ? summary.value : undefined;
      realSellerRating.value = sellerRating.status === 'fulfilled' ? sellerRating.value : undefined;
      return;
    }
  } catch (error) {
    if (current()) {
      loadFailed.value = !product.value;
      uni.showToast({ title: error instanceof Error ? error.message : '商品详情加载失败', icon: 'none' });
    }
  } finally {
    if (current()) { loading.value = false; loadedOnce.value = true; }
  }
}

onLoad(query => {
  detailId.value = String(query?.id || '');
  isRealProduct.value = query?.source === 'real';
  void loadDetail();
});

function addToCart() {
  if (!product.value || !canAdd.value) return showTradeUnavailable();
  if (!cart.addReal(realProductSnapshot(), qty.value)) return;
  uni.showToast({ title: '已加入购物车', icon: 'success' });
}

function realProductSnapshot() {
  if (!product.value) throw new Error('商品不存在');
  if (product.value.aftersaleType === 'unknown') throw new Error('商品售后规则暂不完整，暂不能结算');
  return {
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
  };
}

async function buyNow() {
  if (buying.value || !pageActive) return;
  if (!product.value || !canBuy.value) return showTradeUnavailable();
  buying.value = true;
  const version = pageVersion;
  try {
    const contextId = cart.setBuyNowReal(realProductSnapshot(), qty.value);
    const checkoutUrl = `/pages/checkout/index?mode=buy-now&contextId=${encodeURIComponent(contextId)}`;
    if (await requireLogin(checkoutUrl) && pageActive && version === pageVersion) await uni.navigateTo({ url: checkoutUrl });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '暂时无法进入结算，请重试', icon: 'none' });
  } finally {
    if (pageActive && version === pageVersion) buying.value = false;
  }
}

function showTradeUnavailable() {
  uni.showToast({ title: '该商品暂不支持结算', icon: 'none' });
}

function startPurchase() {
  if (product.value) go(`/pages/purchase/create?productHint=${encodeURIComponent(product.value.title)}`);
}

async function favorite() {
  if (favoriting.value || !pageActive || !product.value || !isRealProduct.value) {
    uni.showToast({ title: '该商品暂不支持收藏', icon: 'none' });
    return;
  }
  const version = pageVersion;
  if (!await requireLogin(`/pages/product/detail?id=${encodeURIComponent(String(product.value.id))}&source=real`)) return;
  if (!pageActive || version !== pageVersion || !product.value) return;
  favoriting.value = true;
  try {
    await favoriteProduct(product.value.id);
    if (pageActive && version === pageVersion) uni.showToast({ title: '已收藏', icon: 'success' });
  } catch (error) {
    if (pageActive && version === pageVersion) uni.showToast({ title: error instanceof Error ? error.message : '收藏失败', icon: 'none' });
  } finally { if (pageActive && version === pageVersion) favoriting.value = false; }
}

function increaseQty() {
  if (!canAdd.value || !product.value) return;
  qty.value = Math.max(1, Math.min(product.value.stock, qty.value + 1));
}

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go(isRealProduct.value ? '/pages/product/list' : '/pages/index/index', true);
}
</script>

<template>
  <view v-if="product" class="detail-page yb-page yb-page--full-bleed" :class="{ 'has-trade-notice': !!tradeNotice }">
    <view class="nav"><view class="nav-btn yb-pressable" @click="goBack"><wd-icon name="arrow-left" size="22px" color="#151820" /></view></view>

    <swiper :indicator-dots="product.images.length > 1" :autoplay="false" circular class="gallery" indicator-active-color="#FFFFFF">
      <swiper-item v-for="(url, index) in product.images" :key="`${url}-${index}`">
        <image :src="failedImages.includes(url) ? UI_ASSETS.placeholders.product : url" :mode="failedImages.includes(url) ? 'aspectFit' : 'aspectFill'" class="gallery-image" @error="!failedImages.includes(url) && failedImages.push(url)" />
      </swiper-item>
      <swiper-item v-if="!product.images.length">
        <image :src="UI_ASSETS.placeholders.product" mode="aspectFit" class="gallery-image gallery-image--placeholder" />
      </swiper-item>
    </swiper>

    <view class="content-sheet">
      <text class="category">{{ product.categoryPath }}</text>
      <text class="title">{{ product.title }}</text>
      <text v-if="product.summary" class="summary">{{ product.summary }}</text>

      <view class="price-block">
        <PriceTag :price="product.price" size="lg" :show-rate="false" />
        <view class="fee-row">
          <text>运费 {{ formatUsdt(product.shippingFee) }}</text>
          <view class="fee-with-tip"><text>税费 {{ formatUsdt(product.tax) }}</text><InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="24" /></view>
          <text>库存 {{ product.stock }}</text>
        </view>
      </view>

      <view class="service-info">
        <view class="service-row"><text class="service-label">售后标注</text><text class="service-value">{{ aftersaleLabel }}</text></view>
        <view v-if="product.overseasCustoms" class="overseas-warn">
          <text class="warning-title">海外直邮限制</text>
          <text>过关后不可退换</text>
          <text class="warning-note">售后标注与海外限制分别展示，实际可操作项目请在订单页核对。</text>
        </view>
      </view>

      <view class="tag-row">
        <text class="tag">销量 {{ product.salesCount }}</text>
        <text class="tag">收藏 {{ product.favoriteCount }}</text>
      </view>

      <view class="seller-section">
        <image :src="UI_ASSETS.placeholders.avatar" class="seller-avatar" mode="aspectFill" />
        <view class="seller-info">
          <view class="seller-head"><text class="seller-name">{{ product.sellerName }}</text></view>
          <text class="seller-sub">买手信息以平台资料为准</text>
          <view v-if="realSellerRating" class="rating-summary">
            <text>买手评分</text>
            <ReviewStars :score="Number(realSellerRating.averageScore ?? realSellerRating.avgScore ?? 0)" size="sm" show-score />
            <text>· {{ realSellerRating.total ?? realSellerRating.totalCount ?? 0 }} 评价</text>
          </view>
        </view>
      </view>

      <view v-if="realReviews.length || reviewLoadFailed" class="section">
        <text class="section-title">商品评价</text>
        <text v-if="reviewLoadFailed" class="section-notice">部分评价信息加载失败，请稍后重试。</text>
        <view v-for="review in realReviews" :key="review.reviewId" class="review-row">
          <view class="review-head"><text>{{ review.userName || '匿名用户' }}</text><ReviewStars :score="review.productScore" size="sm" /></view>
          <text class="review-text">{{ review.content || '用户未填写文字评价' }}</text>
        </view>
        <text v-if="realReviewSummary" class="review-total">共 {{ realReviewSummary.total ?? realReviewSummary.totalCount ?? 0 }} 条评价</text>
      </view>

      <view class="section">
        <text class="section-title">商品详情</text>
        <RichTextContent :content="product.description" />
      </view>
    </view>

    <view class="bottom-bar">
      <text v-if="tradeNotice" class="trade-notice">{{ tradeNotice }}</text>
      <view class="bottom-tools">
      <view class="tool yb-pressable" @click="startPurchase"><wd-icon name="search" size="20px" /><text>求购</text></view>
      <view class="tool yb-pressable" @click="go('/pages/cart/index')"><wd-icon name="cart" size="20px" /><text>购物车</text></view>
      <view class="tool yb-pressable" :class="{ 'tool--disabled': favoriting }" @click="favorite"><wd-icon name="star" size="20px" /><text>{{ favoriting ? '收藏中' : '收藏' }}</text></view>
      <view class="quantity">
        <text @click="qty = Math.max(1, qty - 1)">−</text><text>{{ qty }}</text><text @click="increaseQty">+</text>
      </view>
      </view>
      <view class="bottom-actions">
      <wd-button plain :disabled="!canAdd" @click="canAdd ? addToCart() : showTradeUnavailable()">加购</wd-button>
      <wd-button type="primary" :disabled="!canBuy || buying" :loading="buying" @click="canBuy ? buyNow() : showTradeUnavailable()">立即购买</wd-button>
      </view>
    </view>
  </view>
  <EmptyState v-else-if="!isRealProduct" title="商品链接已失效" description="此商品链接已不可用，请从首页或分类重新选择商品。" action-text="返回" @action="goBack" />
  <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载商品详情</text></view>
  <EmptyState v-else-if="loadFailed" title="商品详情加载失败" description="请稍后重试" action-text="重新加载" @action="loadDetail" />
  <EmptyState v-else title="商品不存在" description="商品可能已下架或链接参数不完整" action-text="返回首页" @action="go('/pages/index/index', true)" />
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100%; padding: 0 0 calc(224rpx + env(safe-area-inset-bottom)); }
.detail-page.has-trade-notice { padding-bottom: calc(304rpx + env(safe-area-inset-bottom)); }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.section-notice { display:block; margin-bottom:16rpx; color:#8b5300; font-size:24rpx; }
.nav { position: fixed; top: env(safe-area-inset-top); left: 0; z-index: 20; padding: 24rpx; }
.nav-btn { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; border-radius: 50%; background: rgba(255,255,255,0.96); box-shadow:var(--yb-shadow-card); }
.gallery { height: 750rpx; background: #edece6; }
.gallery-image { width: 100%; height: 100%; }
.gallery-image--placeholder { box-sizing: border-box; padding: 96rpx; }
.gallery-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #86909c; font-size: 24rpx; }
.content-sheet { position: relative; z-index: 2; margin-top: -24rpx; padding: 28rpx 24rpx; border-radius: 28rpx 28rpx 0 0; background: #fff; }
.category { display: inline-block; padding: 6rpx 16rpx; border-radius: 8rpx; background: #fafaf7; color: var(--yb-muted); font-size: 24rpx; }
.title { display: block; margin-top: 16rpx; color: #0f111a; font-size: 36rpx; font-weight: 700; line-height: 1.45; }
.summary { display: block; margin-top: 8rpx; color: #6b7385; font-size: 24rpx; line-height: 1.5; }
.rating-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx; margin-top: 12rpx; color: var(--yb-muted); font-size: 24rpx; }
.price-block { margin-top: 16rpx; }
.fee-row { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid var(--yb-border); color: var(--yb-muted); font-size: 24rpx; }
.fee-with-tip { display: flex; align-items: center; gap: 4rpx; }
.service-info { margin-top: 24rpx; }
.service-row { display: flex; gap: 24rpx; font-size: 26rpx; line-height: 1.6; }
.service-label { flex: none; color: var(--yb-muted); }
.service-value { color: var(--yb-ink); }
.overseas-warn { display: flex; flex-direction: column; gap: 6rpx; margin-top: 16rpx; padding: 20rpx; border-radius: 12rpx; background: var(--yb-warning-soft, #fff7e8); color: #8b5300; font-size: 24rpx; line-height: 1.6; }
.warning-title { font-weight: 600; }
.warning-note { color: #805b24; }
.trade-notice { color: #805b24; font-size: 24rpx; line-height: 1.5; }
.tag-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 24rpx; }
.tag { padding: 8rpx 16rpx; border: 1rpx solid #edece6; border-radius: 8rpx; background: #fafaf7; color: #1d2129; font-size: 24rpx; }
.seller-section { display: flex; align-items: flex-start; gap: 16rpx; margin-top: 24rpx; padding: 20rpx 0; border-top: 1rpx solid var(--yb-border); border-bottom: 1rpx solid var(--yb-border); }
.seller-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: #f6efe4; }
.seller-avatar.placeholder { display: flex; align-items: center; justify-content: center; color: #b8935a; font-size: 32rpx; font-weight: 700; }
.seller-info { flex: 1; min-width: 0; }
.seller-head { display: flex; align-items: center; gap: 12rpx; }
.seller-name { font-size: 28rpx; font-weight: 700; color: #0f111a; }
.seller-sub { display: block; margin-top: 6rpx; color: #6b7385; font-size: 24rpx; }
.section { margin-top: 24rpx; padding-top: 20rpx; border-top: 1rpx solid var(--yb-border); }
.section-title { display: block; margin-bottom: 16rpx; color: #0f111a; font-size: 30rpx; font-weight: 700; }
.review-row { padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.review-head { display: flex; align-items: center; justify-content: space-between; font-size: 24rpx; }
.review-text, .description { display: block; margin-top: 8rpx; color: #1d2129; font-size: 24rpx; line-height: 1.7; white-space: pre-wrap; }
.bottom-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: flex; flex-direction: column; gap: 12rpx; padding: 12rpx 24rpx calc(6rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid var(--yb-border); background: #fff; }
.tool { display: flex; flex-direction: column; flex-shrink: 0; align-items: center; justify-content: center; min-width: 84rpx; min-height: 84rpx; color: #6b7385; font-size: 24rpx; }.tool--disabled { opacity: .55; pointer-events: none; }.bottom-bar :deep(.wd-button) { flex:1; min-width:0; height:88rpx; padding:0 16rpx; white-space:nowrap; }
.bottom-tools { display: flex; align-items: center; width: 100%; gap: 20rpx; }
.bottom-actions { display: flex; width: 100%; gap: 16rpx; }
.quantity { margin-left: auto; display: flex; flex-shrink:0; align-items: center; min-width:252rpx; padding: 0; border-radius: 8rpx; background: var(--yb-bg); font-size: 24rpx; }.quantity > text { display:flex; flex:1; align-items:center; justify-content:center; min-width:84rpx; min-height:84rpx; }
</style>
