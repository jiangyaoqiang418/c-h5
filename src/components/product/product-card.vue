<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { productImageUrl } from '@shared/utils/image';
import PriceTag from '@/components/common/price-tag.vue';
import { go } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';

interface Props {
  layout?: 'grid' | 'list';
  product: Api.Product.ProductRecord | Api.RealProduct.ProductDTO | Api.RealProduct.ProductListVO;
}
const props = defineProps<Props>();

function isReal(
  record: Api.Product.ProductRecord | Api.RealProduct.ProductDTO | Api.RealProduct.ProductListVO
): record is Api.RealProduct.ProductDTO | Api.RealProduct.ProductListVO {
  return 'afterSaleType' in record;
}

const imgError = ref(false);
const cover = computed(() => {
  if ('coverImage' in props.product && props.product.coverImage) return props.product.coverImage;
  const first = 'images' in props.product ? props.product.images?.[0] : undefined;
  if (typeof first === 'string') return first;
  if (first?.url) return first.url;
  if ('categoryPath' in props.product) return productImageUrl(props.product.id, 400, props.product.categoryPath);
  return '';
});
const isRealProduct = computed(() => isReal(props.product));
watch(cover, () => { imgError.value = false; });
const overseas = computed(() => isReal(props.product) ? !!props.product.overseasClearance : !!props.product.overseasCustoms);
const categoryLabel = computed(() => (
  'categoryPath' in props.product
    ? props.product.categoryPath.split('/').pop() || '油宝甄选'
    : 'categoryName' in props.product && props.product.categoryName
      ? props.product.categoryName
      : '油宝甄选'
));
const sellerLabel = computed(() => 'sellerName' in props.product ? props.product.sellerName : '认证买手');

function onImgError() {
  imgError.value = true;
}

function goDetail() {
  const source = isRealProduct.value ? '&source=real' : '';
  go(`/pages/product/detail?id=${encodeURIComponent(String(props.product.id))}${source}`);
}
</script>

<template>
  <view class="p-card" :class="{ 'p-card--list': layout === 'list' }" @click="goDetail">
    <view class="cover-wrap">
      <image v-if="cover && !imgError" :src="cover" mode="aspectFill" class="cover" @error="onImgError" />
      <image v-else :src="UI_ASSETS.placeholders.product" mode="aspectFit" class="cover image-fallback" />
      <view v-if="overseas" class="badge overseas">
        <text>海外直邮</text>
      </view>
      <view v-if="product.stock === 0" class="sold-out">
        <text>已售罄</text>
      </view>
    </view>
    <view class="info">
      <text v-if="layout === 'list'" class="brand">{{ categoryLabel }}</text>
      <text class="title">{{ product.title }}</text>
      <PriceTag class="price-row" :price="product.price" size="sm" :show-rate="false" />
      <view class="bottom">
        <text class="seller">{{ sellerLabel }}</text>
        <text class="sales">销 {{ product.salesCount || 0 }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.p-card {
  background: var(--yb-surface);
  border-radius: var(--yb-radius-card);
  overflow: hidden;
  transition: transform 0.2s;
  box-shadow: var(--yb-shadow-card);
  border: 1rpx solid var(--yb-hairline);
}
.p-card:active {
  transform: scale(0.98);
}
.cover-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1/1;
  background: var(--yb-champagne);
  overflow: hidden;
}
.cover {
  width: 100%;
  height: 100%;
  display: block;
}
.image-fallback {
  padding: 24rpx;
}
.badge {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 500;
}
.badge.overseas {
  background: #fff7e8;
  color: #805b24;
}
.sold-out {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(250, 250, 247, 0.88);
  color: var(--yb-muted);
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
}
.info {
  padding: 16rpx 16rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.brand {
  font-size: 24rpx;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--yb-muted);
}
.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.4;
  color: var(--yb-ink);
  min-height: 72rpx;
  letter-spacing: -0.5rpx;
}
.price-row {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  margin-top: 8rpx;
}
.bottom {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: var(--yb-muted);
  margin-top: 4rpx;
}
.seller {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 65%;
}
.sales {
  font-family: var(--yb-font-body);
}
.p-card--list { display: flex; padding: 16rpx; gap: 16rpx; }
.p-card--list .cover-wrap { width: 128rpx; height: 128rpx; flex-shrink: 0; border-radius: 12rpx; }
.p-card--list .info { flex: 1; min-width: 0; padding: 0; gap: 4rpx; }
.p-card--list .brand { display: none; }
.p-card--list .title { min-height: 0; font-size: 26rpx; }
.p-card--list .bottom { font-size: 24rpx; gap: 8rpx; }
.p-card--list .badge { top: 0; left: 0; padding: 4rpx 6rpx; font-size: 24rpx; border-radius: 0 0 8rpx 0; }
</style>
