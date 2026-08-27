<script setup lang="ts">
import { computed } from 'vue';
import { go } from '@/utils/navigate';
import PriceTag from '@/components/common/price-tag.vue';
import { UI_ASSETS } from '@/constants/ui-assets';

interface Props {
  product: Api.Product.ProductRecord;
}
const props = defineProps<Props>();

const cover = computed(
  () => props.product.images?.[0]?.url || UI_ASSETS.placeholders.product
);

function goDetail() {
  go(`/pages/product/detail?id=${props.product.id}`);
}
</script>

<template>
  <view class="tile" @click="goDetail">
    <image :src="cover" mode="aspectFill" class="cover" />
    <view class="info">
      <text class="title">{{ product.title }}</text>
      <text class="summary">{{ product.summary }}</text>
      <view class="bottom">
        <PriceTag :price="product.price" size="sm" />
        <text class="sales">销 {{ product.salesCount || 0 }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.tile {
  display: flex;
  gap: 16rpx;
  background: var(--yb-surface);
  padding: 20rpx;
  border-radius: var(--yb-radius-lg);
  box-shadow: var(--yb-shadow-card);
}
.cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: var(--yb-radius-md);
  flex-shrink: 0;
}
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}
.title {
  font-size: 26rpx;
  color: #1d2129;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}
.summary {
  font-size: 22rpx;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.sales {
  font-size: 20rpx;
  color: #86909c;
}
</style>
