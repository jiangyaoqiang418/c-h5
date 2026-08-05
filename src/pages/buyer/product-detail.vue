<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchBuyerProductDetail, setProductShelf } from '@/service/api/product';
import { formatAmount } from '@/utils/format-bridge';

const id = ref('');
const product = ref<Api.RealProduct.ProductDTO>();
const loading = ref(true);

const statusType = computed(() => {
  if (product.value?.status === 'ON_SALE') return 'success';
  if (product.value?.status === 'REVIEWING') return 'warning';
  if (product.value?.status === 'REJECTED' || product.value?.status === 'FROZEN') return 'danger';
  return 'default';
});

const afterSaleLabel = computed(() => {
  const labels: Record<Api.RealProduct.AfterSaleType, string> = {
    SEVEN_DAY_NO_REASON: '7天无理由',
    NONE: '无售后',
    SHOP_WARRANTY: '店铺保修',
    NATIONAL_WARRANTY: '全国联保'
  };
  return product.value ? labels[product.value.afterSaleType] : '';
});

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  if (!id.value) return;
  loading.value = true;
  try {
    product.value = await fetchBuyerProductDetail(id.value);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '商品详情加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function toggleShelf() {
  if (!product.value) return;
  const onShelf = product.value.status === 'OFF_SHELF';
  uni.showModal({
    title: onShelf ? '确认上架' : '确认下架',
    content: onShelf ? '确认重新上架该商品？' : '确认下架该商品？',
    success: async result => {
      if (!result.confirm || !product.value) return;
      try {
        await setProductShelf(product.value.id, onShelf);
        uni.showToast({ title: onShelf ? '已上架' : '已下架', icon: 'success' });
        await load();
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '商品状态更新失败', icon: 'none' });
      }
    }
  });
}

onLoad(query => {
  id.value = String(query?.id || '');
  load();
});
</script>

<template>
  <view class="detail-page">
    <view v-if="loading" class="loading">加载中...</view>
    <template v-else-if="product">
      <swiper v-if="product.images?.length" indicator-dots class="gallery">
        <swiper-item v-for="image in product.images" :key="image">
          <image :src="image" mode="aspectFill" class="gallery-image" />
        </swiper-item>
      </swiper>

      <view class="section main-section">
        <view class="status-row">
          <wd-tag :type="statusType">{{ product.statusText || product.status }}</wd-tag>
          <text class="stock">库存 {{ product.stock }}</text>
        </view>
        <text class="title">{{ product.title }}</text>
        <text v-if="product.brief" class="brief">{{ product.brief }}</text>
        <text class="price">U {{ formatAmount(product.price) }}</text>
      </view>

      <view v-if="product.reviewComment" class="section review-section">
        <text class="section-title">审核意见</text>
        <text class="review-text">{{ product.reviewComment }}</text>
      </view>

      <view class="section">
        <text class="section-title">商品信息</text>
        <view class="row"><text class="label">商品 ID</text><text>{{ product.id }}</text></view>
        <view class="row"><text class="label">分类 ID</text><text>{{ product.categoryId }}</text></view>
        <view class="row"><text class="label">运费</text><text>U {{ formatAmount(product.shippingFee || 0) }}</text></view>
        <view class="row"><text class="label">税费</text><text>U {{ formatAmount(product.taxFee || 0) }}</text></view>
        <view class="row"><text class="label">售后</text><text>{{ afterSaleLabel }}</text></view>
        <view class="row"><text class="label">海外过关</text><text>{{ product.overseasClearance ? '是' : '否' }}</text></view>
        <view class="row"><text class="label">创建时间</text><text>{{ formatTime(product.createdAt) }}</text></view>
      </view>

      <view class="section">
        <text class="section-title">详细描述</text>
        <text class="description">{{ product.description || '暂无详细描述' }}</text>
      </view>

      <view v-if="product.status === 'ON_SALE' || product.status === 'OFF_SHELF'" class="bottom-bar">
        <wd-button type="primary" block @click="toggleShelf">{{ product.status === 'ON_SALE' ? '下架商品' : '重新上架' }}</wd-button>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100vh; box-sizing: border-box; padding-bottom: 180rpx; background: #f7f8fa; }
.loading { padding: 120rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
.gallery { width: 100%; height: 600rpx; background: #f2f3f5; }
.gallery-image { width: 100%; height: 100%; }
.section { margin-top: 16rpx; padding: 24rpx; background: #fff; }
.main-section { margin-top: 0; }
.status-row { display: flex; align-items: center; justify-content: space-between; }
.stock { font-size: 22rpx; color: #86909c; }
.title { display: block; margin-top: 16rpx; font-size: 32rpx; font-weight: 700; line-height: 1.4; color: #1d2129; }
.brief { display: block; margin-top: 8rpx; font-size: 24rpx; color: #86909c; }
.price { display: block; margin-top: 20rpx; font-size: 42rpx; font-weight: 700; color: #f53f3f; font-family: ui-monospace, monospace; }
.section-title { display: block; margin-bottom: 12rpx; font-size: 28rpx; font-weight: 600; color: #1d2129; }
.row { display: flex; justify-content: space-between; gap: 24rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 24rpx; }
.label { flex-shrink: 0; color: #86909c; }
.review-section { background: #fff7e6; }
.review-text, .description { display: block; font-size: 24rpx; line-height: 1.7; color: #4e5969; white-space: pre-wrap; }
.bottom-bar {
  position: fixed; right: 0; bottom: 0; left: 0; padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f2f3f5; background: #fff;
}
</style>
