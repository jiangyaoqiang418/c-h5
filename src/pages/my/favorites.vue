<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { fetchFavoriteProducts, unfavoriteProduct } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.RealProduct.ProductDTO[]>([]);
const total = ref(0);
const current = ref(1);
const size = 20;
const loading = ref(false);
let loadSequence = 0;

onLoad(() => load(true));

async function load(reset = false) {
  if (loading.value && !reset) return;
  if (reset) {
    current.value = 1;
    list.value = [];
    total.value = 0;
  }
  const sequence = ++loadSequence;
  const requestedPage = current.value;
  loading.value = true;
  try {
    const page = await fetchFavoriteProducts({ pageNo: requestedPage, pageSize: size });
    if (sequence !== loadSequence) return;
    list.value = reset ? page.records : list.value.concat(page.records);
    total.value = page.total;
  } catch (error) {
    if (sequence === loadSequence) {
      if (!reset && current.value === requestedPage) current.value = Math.max(1, requestedPage - 1);
      uni.showToast({ title: error instanceof Error ? error.message : '收藏加载失败', icon: 'none' });
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      uni.stopPullDownRefresh();
    }
  }
}

function removeFavorite(id: string | number) {
  uni.showModal({
    title: '取消收藏？',
    content: '取消后可在商品详情重新收藏',
    success: async result => {
      if (!result.confirm) return;
      try {
        await unfavoriteProduct(id);
        list.value = list.value.filter(item => String(item.id) !== String(id));
        total.value = Math.max(0, total.value - 1);
        uni.showToast({ title: '已取消收藏', icon: 'success' });
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '取消收藏失败', icon: 'none' });
      }
    }
  });
}

onPullDownRefresh(() => load(true));
onReachBottom(() => {
  if (list.value.length < total.value) {
    current.value += 1;
    load();
  }
});
</script>

<template>
  <view class="favorites-page">
    <view v-if="list.length" class="grid">
      <view v-for="product in list" :key="product.id" class="favorite-item">
        <ProductCard :product="product" />
        <view class="remove" @click.stop="removeFavorite(product.id)">取消收藏</view>
      </view>
    </view>
    <EmptyState v-else-if="!loading" title="暂未收藏商品" description="去商品详情收藏你喜欢的商品" />
    <view v-if="loading" class="loading">加载中…</view>
    <view v-else-if="list.length && list.length >= total" class="no-more">没有更多了</view>
  </view>
</template>

<style lang="scss" scoped>
.favorites-page { min-height: 100%; padding: 16rpx; background: #f7f8fa; }
.grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.favorite-item { width: calc((100% - 16rpx) / 2); min-width: 0; }
.remove { margin-top: 12rpx; padding: 14rpx 0; border-radius: 12rpx; background: #fff; color: #6b7385; font-size: 24rpx; text-align: center; }
.loading, .no-more { padding: 32rpx; color: #86909c; font-size: 24rpx; text-align: center; }
</style>
