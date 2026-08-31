<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onUnload } from '@dcloudio/uni-app';
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
const current = ref(0);
const size = 20;
const loading = ref(false);
const loadFailed = ref(false);
const keyword = ref('');
const categoryId = ref<string>();
const sortKey = ref<SortKey>('sales');
let loadSequence = 0;
let disposed = false;
let querySnapshot: { keyword?: string; categoryId?: string; sortBy: Api.RealProduct.PublicProductSort } = { sortBy: 'DEFAULT' };

function submitSearch() {
  querySnapshot = { keyword: keyword.value.trim() || undefined, categoryId: categoryId.value, sortBy: sortMap[sortKey.value] };
  return load(true);
}

onLoad(query => {
  if (query?.keyword) keyword.value = String(query.keyword);
  if (query?.categoryId) categoryId.value = String(query.categoryId);
  if (query?.sort && query.sort in sortMap) sortKey.value = query.sort as SortKey;
  submitSearch();
});
onUnload(() => { disposed = true; loadSequence++; });

async function load(reset = false) {
  if (disposed || (loading.value && !reset)) return;
  loadFailed.value = false;
  if (reset) {
    current.value = 0;
    list.value = [];
    total.value = 0;
  }
  const sequence = ++loadSequence;
  const requestedPage = reset ? 1 : current.value + 1;
  const query = querySnapshot;
  loading.value = true;
  try {
    const r = await fetchStorefrontProducts({
      pageNo: requestedPage,
      pageSize: size,
      ...query
    });
    if (sequence !== loadSequence) return;
    const count = Number(r.total);
    if (!Array.isArray(r.records) || !Number.isSafeInteger(count) || count < 0
      || (!r.records.length && (requestedPage - 1) * size < count)) throw new Error('商品分页数据不完整，请重试');
    const merged = new Map((reset ? [] : list.value).map(item => [String(item.id), item]));
    r.records.forEach(item => merged.set(String(item.id), item));
    list.value = [...merged.values()];
    total.value = count;
    current.value = requestedPage;
  } catch (error) {
    if (sequence === loadSequence) {
      loadFailed.value = true;
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
  if (!loading.value && list.value.length < total.value) {
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
  submitSearch();
}
</script>

<template>
  <view class="list-page yb-page yb-page--full-bleed">
    <view class="search">
      <input v-model="keyword" placeholder="搜索商品 / 买手 / 品牌" class="search-input" @confirm="submitSearch" />
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
    <EmptyState v-else-if="loadFailed" title="商品列表加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading" title="没有找到符合条件的商品" description="尝试调整搜索条件" />

    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载商品</text></view>
    <wd-button v-else-if="loadFailed" block plain @click="load(false)">加载失败，点击重试</wd-button>
    <view v-else-if="list.length >= total" class="no-more">没有更多了</view>
  </view>
</template>

<style lang="scss" scoped>
.list-page {
  min-height: 100%;
  padding: 0 0 32rpx;
}
.search {
  height: 96rpx;
  padding: 12rpx 24rpx;
  box-sizing: border-box;
  background: var(--yb-surface);
  border-top: 1rpx solid var(--yb-hairline);
  border-bottom: 1rpx solid var(--yb-hairline);
  position: sticky;
  top: 0;
  z-index: 10;
}
/* #ifdef H5 */
.search { top: 44px; }
/* #endif */
.search-input {
  display: block;
  width: 100%;
  height: 72rpx;
  box-sizing: border-box;
  background: var(--yb-bg-muted);
  border-radius: var(--yb-radius-pill);
  padding: 0 24rpx;
  font-size: 26rpx;
  line-height: 72rpx;
}
.sort-row {
  display: flex;
  background: var(--yb-surface);
  border-bottom: 1rpx solid var(--yb-border);
  position: sticky;
  top: 92rpx;
  z-index: 9;
}
/* #ifdef H5 */
.sort-row { top: calc(44px + 96rpx); }
/* #endif */
.sort-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80rpx;
  text-align: center;
  padding: 0;
  font-size: 26rpx;
  color: var(--yb-text-secondary);
}
.sort-item.active {
  color: var(--yb-brand);
  font-weight: 600;
  border-bottom: 4rpx solid var(--yb-brand);
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 16rpx 0;
}
.grid > * { width: calc((100% - 12rpx) / 2); min-width: 0; }
.loading, .no-more {
  text-align: center;
  padding: 32rpx;
  color: #86909c;
  font-size: 24rpx;
}
.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; }
</style>
