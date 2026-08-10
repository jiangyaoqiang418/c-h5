<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { fetchStorefrontProducts } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

type SortKey = 'sales' | 'newest' | 'price-asc' | 'price-desc';

const sortMap: Record<SortKey, Api.RealProduct.PublicProductSort> = {
  sales: 'DEFAULT',
  newest: 'NEW',
  'price-asc': 'PRICE_ASC',
  'price-desc': 'PRICE_DESC'
};

const list = ref<Api.RealProduct.ProductListVO[]>([]);
const total = ref(0);
const current = ref(1);
const size = 20;
const loading = ref(false);
const keyword = ref('');
const categoryId = ref<string>();
const sortKey = ref<SortKey>('sales');
let loadSequence = 0;

onLoad(query => {
  if (query?.keyword) keyword.value = String(query.keyword);
  if (query?.categoryId) categoryId.value = String(query.categoryId);
  if (query?.sort && query.sort in sortMap) sortKey.value = query.sort as SortKey;
  load(true);
});

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
    const r = await fetchStorefrontProducts({
      pageNo: current.value,
      pageSize: size,
      keyword: keyword.value || undefined,
      categoryId: categoryId.value,
      sortBy: sortMap[sortKey.value]
    });
    if (sequence !== loadSequence) return;
    if (reset) list.value = r.records;
    else list.value = list.value.concat(r.records);
    total.value = r.total;
  } catch (error) {
    if (sequence === loadSequence) {
      if (!reset && current.value === requestedPage) current.value = Math.max(1, requestedPage - 1);
      uni.showToast({ title: error instanceof Error ? error.message : '商品列表加载失败', icon: 'none' });
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      uni.stopPullDownRefresh();
    }
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
  sortKey.value = v as SortKey;
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
  min-height: 100%;
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
/* #ifdef H5 */
.search { top: 44px; }
/* #endif */
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
/* #ifdef H5 */
.sort-row { top: calc(44px + 92rpx); }
/* #endif */
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
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 16rpx;
}
.grid > * { width: calc((100% - 16rpx) / 2); min-width: 0; }
.loading, .no-more {
  text-align: center;
  padding: 32rpx;
  color: #86909c;
  font-size: 24rpx;
}
</style>
