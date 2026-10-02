<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onUnload } from '@dcloudio/uni-app';
import { fetchStorefrontProducts } from '@/service/api/product';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
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
const categoryScopeId = ref<string>();
const categoryTree = ref<CategoryNode[]>([]);
const categoriesLoading = ref(false);
const categoriesLoadFailed = ref(false);
const sortKey = ref<SortKey>('sales');
let loadSequence = 0;
let categorySequence = 0;
let disposed = false;
let querySnapshot: { keyword?: string; categoryId?: string; sortBy: Api.RealProduct.PublicProductSort } = { sortBy: 'DEFAULT' };

function findCategoryPath(nodes: CategoryNode[], id?: string, parents: CategoryNode[] = []): CategoryNode[] {
  if (!id) return [];
  for (const node of nodes) {
    const path = [...parents, node];
    if (String(node.id) === id) return path;
    const childPath = findCategoryPath(node.children || [], id, path);
    if (childPath.length) return childPath;
  }
  return [];
}
const categoryPath = computed(() => {
  const path = findCategoryPath(categoryTree.value, categoryId.value);
  const scopeIndex = path.findIndex(node => String(node.id) === categoryScopeId.value);
  return scopeIndex >= 0 ? path.slice(scopeIndex) : [];
});
const filterParent = computed(() => {
  const path = categoryPath.value;
  const selected = path[path.length - 1];
  return selected?.children?.some(node => node.enabled !== false) ? selected : path[path.length - 2];
});
const subcategories = computed(() => filterParent.value?.children?.filter(node => node.enabled !== false) || []);
const selectedCategoryAnchor = computed(() => {
  const index = subcategories.value.findIndex(node => String(node.id) === categoryId.value);
  return index >= 0 ? `subcategory-${index}` : 'subcategory-all';
});

async function loadCategories() {
  if (disposed || !categoryScopeId.value) return;
  const sequence = ++categorySequence;
  categoriesLoading.value = true;
  categoriesLoadFailed.value = false;
  try {
    const tree = await fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: true });
    if (!disposed && sequence === categorySequence) categoryTree.value = tree;
  } catch {
    if (!disposed && sequence === categorySequence) categoriesLoadFailed.value = true;
  } finally {
    if (!disposed && sequence === categorySequence) categoriesLoading.value = false;
  }
}

function selectCategory(id: string) {
  if (disposed || id === categoryId.value) return;
  const scope = findCategoryPath(categoryTree.value, categoryScopeId.value).slice(-1)[0];
  if (!scope || !findCategoryPath([scope], id).length) return;
  categoryId.value = id;
  // 切换分类沿用已应用的搜索词和排序，重置分页并使旧请求失效。
  querySnapshot = { ...querySnapshot, categoryId: id };
  void load(true);
}

function submitSearch() {
  querySnapshot = { keyword: keyword.value.trim() || undefined, categoryId: categoryId.value, sortBy: sortMap[sortKey.value] };
  return load(true);
}
function clearSearch() {
  keyword.value = '';
  return submitSearch();
}

onLoad(query => {
  if (query?.keyword) keyword.value = String(query.keyword);
  if (query?.categoryId) {
    categoryId.value = String(query.categoryId);
    categoryScopeId.value = categoryId.value;
    void loadCategories();
  }
  if (query?.sort && query.sort in sortMap) sortKey.value = query.sort as SortKey;
  submitSearch();
});
onUnload(() => { disposed = true; loadSequence++; categorySequence++; });

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

onPullDownRefresh(() => { void loadCategories(); void load(true); });
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

    <view v-if="categoriesLoading && !categoryTree.length" class="category-feedback">正在加载分类…</view>
    <view v-else-if="categoriesLoadFailed" class="category-feedback category-feedback--error" @click="loadCategories">分类筛选加载失败，点击重试</view>
    <view v-else-if="subcategories.length && filterParent" class="category-filter">
      <scroll-view v-if="categoryPath.length > 1" scroll-x class="category-path" :show-scrollbar="false">
        <view class="category-path-track">
          <template v-for="(node, index) in categoryPath" :key="String(node.id)">
            <text v-if="index" class="category-path-divider">/</text>
            <view class="category-crumb" :class="{ 'is-current': String(node.id) === categoryId }" role="button" @click="selectCategory(String(node.id))"><text class="category-option-label">{{ node.name }}</text></view>
          </template>
        </view>
      </scroll-view>
      <scroll-view :key="String(filterParent.id)" scroll-x class="subcategory-scroll" :show-scrollbar="false" :scroll-into-view="selectedCategoryAnchor" scroll-with-animation>
        <view class="subcategory-track">
          <view id="subcategory-all" class="subcategory-option" :class="{ active: String(filterParent.id) === categoryId }" role="button" :aria-pressed="String(filterParent.id) === categoryId" @click="selectCategory(String(filterParent.id))"><text class="category-option-label">全部{{ filterParent.name }}</text></view>
          <view v-for="(node, index) in subcategories" :id="`subcategory-${index}`" :key="String(node.id)" class="subcategory-option" :class="{ active: String(node.id) === categoryId }" role="button" :aria-pressed="String(node.id) === categoryId" @click="selectCategory(String(node.id))"><text class="category-option-label">{{ node.name }}</text><wd-icon v-if="node.children?.some(child => child.enabled !== false)" name="arrow-down" size="22rpx" /></view>
        </view>
      </scroll-view>
    </view>

    <view v-if="list.length" class="grid">
      <ProductCard v-for="p in list" :key="p.id" :product="p" />
    </view>
    <EmptyState v-else-if="loadFailed" title="商品列表加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading && querySnapshot.keyword" title="没有找到符合条件的商品" description="可清除搜索词，保留当前分类与排序继续查看。" action-text="清除搜索词" @action="clearSearch" />
    <EmptyState v-else-if="!loading" title="当前没有可展示的商品" description="当前分类或列表没有返回商品，可稍后查看。" />

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
  top: 96rpx;
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
.category-filter { padding: 16rpx 0; border-bottom: 1rpx solid var(--yb-hairline); background: var(--yb-surface); }
.category-path, .subcategory-scroll { width: 100%; white-space: nowrap; }
.category-path-track, .subcategory-track { display: inline-flex; align-items: center; padding: 0 24rpx; gap: 12rpx; vertical-align: top; }
.category-path-track { margin-bottom: 12rpx; gap: 8rpx; }
.category-crumb { display: flex; flex-shrink: 0; align-items: center; min-height: 72rpx; max-width: 240rpx; color: var(--yb-muted); font-size: 24rpx; }
.category-crumb.is-current { color: var(--yb-ink); font-weight: 500; }
.category-path-divider { color: var(--yb-hairline-2); font-size: 24rpx; }
.subcategory-option { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; min-height: 72rpx; max-width: 280rpx; padding: 0 24rpx; box-sizing: border-box; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-pill); background: var(--yb-bg); color: var(--yb-ink-2); font-size: 24rpx; gap: 8rpx; }
.category-option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subcategory-option.active { border-color: var(--yb-brand); background: var(--yb-brand-soft); color: var(--yb-brand); font-weight: 600; }
.category-feedback { padding: 20rpx 24rpx; background: var(--yb-surface); color: var(--yb-muted); font-size: 24rpx; }
.category-feedback--error { color: var(--yb-brand); }
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 20rpx;
}
.grid > * { width: calc((100% - 16rpx) / 2); min-width: 0; }
.loading, .no-more {
  text-align: center;
  padding: 32rpx;
  color: var(--yb-muted);
  font-size: 24rpx;
}
.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; }
</style>

<style scoped lang="scss">
.subcategory-option { min-height:44px; }.category-path-track { margin-bottom:4rpx; }.category-option-label { max-width:100%; }
</style>
