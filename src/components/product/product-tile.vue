<script setup lang="ts">
import { computed } from 'vue';
import { go } from '@/utils/navigate';
import PriceTag from '@/components/common/price-tag.vue';

interface Props {
  product: Api.Product.ProductRecord;
}
const props = defineProps<Props>();

const cover = computed(
  () => props.product.images?.[0]?.url || `https://picsum.photos/seed/${props.product.id}/200/200`
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
  background: #fff;
  padding: 16rpx;
  border-radius: 12rpx;
}
.cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 8rpx;
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
