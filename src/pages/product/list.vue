<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { productApi } from '@shared';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.Product.ProductRecord[]>([]);
const total = ref(0);
const current = ref(1);
const size = 20;
const loading = ref(false);
const keyword = ref('');
const categoryId = ref<number | undefined>();
const sortKey = ref<'sales' | 'newest' | 'price-asc' | 'price-desc'>('sales');

onLoad(query => {
  if (query?.keyword) keyword.value = String(query.keyword);
  if (query?.categoryId) categoryId.value = Number(query.categoryId);
  if (query?.sort) sortKey.value = query.sort as typeof sortKey.value;
  load(true);
});

async function load(reset = false) {
  if (loading.value) return;
  if (reset) {
    current.value = 1;
    list.value = [];
  }
  loading.value = true;
  try {
    const r = await productApi.fetchProductList({
      current: current.value,
      size,
      keyword: keyword.value || undefined,
      categoryId: categoryId.value,
      sort: sortKey.value
    });
    if (reset) list.value = r.records;
    else list.value = list.value.concat(r.records);
    total.value = r.total;
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onPullDownRefresh(() => load(true));
onReachBottom(() => {
  if (list.value.length < total.value) {
    current.value += 1;
    load();
  }
});

const SORTS = [
  { value: 'sales', label: '综合' },
  { value: 'newest', label: '最新' },
  { value: 'price-asc', label: '价格升' },
  { value: 'price-desc', label: '价格降' }
] as const;

function onSortChange(v: string) {
  sortKey.value = v as typeof sortKey.value;
  load(true);
}
</script>

<template>
  <view class="list-page">
    <view class="search">
      <input v-model="keyword" placeholder="搜索商品 / 买手 / 品牌" class="search-input" @confirm="load(true)" />
    </view>

    <view class="sort-row">
      <view
        v-for="s in SORTS"
        :key="s.value"
        class="sort-item"
        :class="{ active: sortKey === s.value }"
        @click="onSortChange(s.value)"
      >
        <text>{{ s.label }}</text>
      </view>
    </view>

    <view v-if="list.length" class="grid">
      <ProductCard v-for="p in list" :key="p.id" :product="p" />
    </view>
    <EmptyState v-else-if="!loading" title="没有找到符合条件的商品" description="尝试调整搜索条件" />

    <view v-if="loading" class="loading">加载中…</view>
    <view v-else-if="list.length >= total" class="no-more">没有更多了</view>
  </view>
</template>

<style lang="scss" scoped>
.list-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 32rpx;
}
.search {
  padding: 16rpx;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}
.search-input {
  background: #f7f8fa;
  border-radius: 32rpx;
  padding: 16rpx 24rpx;
  font-size: 26rpx;
}
.sort-row {
  display: flex;
  background: #fff;
  border-bottom: 1rpx solid #f2f3f5;
  position: sticky;
  top: 92rpx;
  z-index: 9;
}
.sort-item {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: 26rpx;
  color: #4e5969;
}
.sort-item.active {
  color: #4d80f0;
  font-weight: 600;
  border-bottom: 4rpx solid #4d80f0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
  padding: 16rpx;
}
.loading, .no-more {
  text-align: center;
  padding: 32rpx;
  color: #86909c;
  font-size: 24rpx;
}
</style>
