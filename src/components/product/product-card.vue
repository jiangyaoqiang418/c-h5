<script setup lang="ts">
import { computed, ref } from 'vue';
import { productImageUrl } from '@shared/utils/image';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { go } from '@/utils/navigate';

interface Props {
  product: Api.Product.ProductRecord;
}
const props = defineProps<Props>();

const imgError = ref(false);
const cover = computed(() => {
  if (imgError.value) return 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23EDECE6%22/></svg>';
  return props.product.images?.[0]?.url || productImageUrl(props.product.id, 400, props.product.categoryPath);
});

function onImgError() {
  imgError.value = true;
}

function goDetail() {
  go(`/pages/product/detail?id=${props.product.id}`);
}
</script>

<template>
  <view class="p-card" @click="goDetail">
    <view class="cover-wrap">
      <image :src="cover" mode="aspectFill" class="cover" @error="onImgError" />
      <view v-if="product.overseasCustoms" class="badge overseas">
        <text>🌏 海外直邮</text>
      </view>
      <view v-if="product.stock === 0" class="sold-out">
        <text>已售罄</text>
      </view>
    </view>
    <view class="info">
      <text class="brand">{{ (product.categoryPath || '').split('/').pop() || '油宝甄选' }}</text>
      <text class="title">{{ product.title }}</text>
      <view class="price-row">
        <text class="cny">{{ formatUsdt(product.price) }}</text>
        <text class="usdt">≈ {{ formatCny(product.price) }}</text>
      </view>
      <view class="bottom">
        <text class="seller">{{ product.sellerName }}</text>
        <text class="sales">销 {{ product.salesCount || 0 }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.p-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
  transition: transform 0.2s;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.04);
  border: 1rpx solid #EDECE6;
}
.p-card:active {
  transform: scale(0.98);
}
.cover-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1/1;
  background: #EDECE6;
  overflow: hidden;
}
.cover {
  width: 100%;
  height: 100%;
  display: block;
}
.badge {
  position: absolute;
  top: 14rpx;
  left: 14rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 500;
}
.badge.overseas {
  background: rgba(184, 147, 90, 0.92);
  color: #FFFFFF;
}
.sold-out {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(250, 250, 247, 0.88);
  color: #6B7385;
  font-size: 30rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
}
.info {
  padding: 20rpx 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.brand {
  font-size: 18rpx;
  letter-spacing: 2rpx;
  text-transform: uppercase;
  color: #6B7385;
}
.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.4;
  color: #0F111A;
  min-height: 72rpx;
  letter-spacing: -0.5rpx;
}
.price-row {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  margin-top: 8rpx;
}
.cny {
  font-family: ui-monospace, monospace;
  font-size: 34rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -1rpx;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.usdt {
  font-family: ui-monospace, monospace;
  font-size: 18rpx;
  color: #6B7385;
  font-weight: 500;
}
.bottom {
  display: flex;
  justify-content: space-between;
  font-size: 20rpx;
  color: #A8ADB8;
  margin-top: 4rpx;
}
.seller {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}
.sales {
  font-family: ui-monospace, monospace;
}
</style>
