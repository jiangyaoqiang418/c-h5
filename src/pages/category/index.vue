<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchStorefrontProducts } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { UI_ASSETS } from '@/constants/ui-assets';

const roots = ref<CategoryNode[]>([]);
const activeRoot = ref<string>();
const activeCategoryId = ref<string>();
const products = ref<Api.RealProduct.ProductListVO[]>([]);
const loading = ref(false);
const current = ref(1);
const total = ref(0);
const pageSize = 20;
let loadSequence = 0;

const activeRootNode = computed(() => roots.value.find(item => item.id === activeRoot.value));
const activeCategory = computed(() => findCategory(roots.value, activeCategoryId.value));
const activePath = computed(() => findCategoryPath(roots.value, activeCategoryId.value)?.map(item => item.name) || []);
const heroImage = computed(() => products.value[0]?.coverImage || UI_ASSETS.placeholders.product);

function findCategory(nodes: CategoryNode[], id?: string): CategoryNode | undefined {
  if (!id) return undefined;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findCategory(node.children || [], id);
    if (child) return child;
  }
  return undefined;
}

function findCategoryPath(nodes: CategoryNode[], id?: string, parents: CategoryNode[] = []): CategoryNode[] | undefined {
  if (!id) return undefined;
  for (const node of nodes) {
    const path = [...parents, node];
    if (node.id === id) return path;
    const childPath = findCategoryPath(node.children || [], id, path);
    if (childPath) return childPath;
  }
  return undefined;
}

function activateRoot(id: string) {
  activeRoot.value = id;
  activeCategoryId.value = id;
}

function activateCategory(id: string) {
  activeCategoryId.value = id;
}

async function load(id?: string, reset = false) {
  if (!id || (loading.value && !reset)) return;
  if (reset) {
    current.value = 1;
    products.value = [];
    total.value = 0;
  }
  const sequence = ++loadSequence;
  const requestedPage = current.value;
  loading.value = true;
  try {
    const response = await fetchStorefrontProducts({
      categoryId: id,
      pageNo: current.value,
      pageSize,
      sortBy: 'DEFAULT'
    });
    if (sequence !== loadSequence) return;
    products.value = reset ? response.records : products.value.concat(response.records);
    total.value = response.total;
  } catch (error) {
    if (sequence === loadSequence) {
      if (!reset && current.value === requestedPage) current.value = Math.max(1, requestedPage - 1);
      uni.showToast({ title: error instanceof Error ? error.message : '分类商品加载失败', icon: 'none' });
    }
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function loadMore() {
  if (loading.value || products.value.length >= total.value) return;
  current.value += 1;
  load(activeCategoryId.value);
}

onMounted(async () => {
  try {
    roots.value = await fetchCategoryTree({ onlyEnabled: true });
    const firstRootId = roots.value[0]?.id;
    if (firstRootId) activateRoot(firstRootId);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '分类加载失败', icon: 'none' });
  }
});

watch(activeCategoryId, id => load(id, true));
</script>

<template>
  <view class="category-page h5-tab-page">
    <view class="category-layout">
      <scroll-view v-if="roots.length" scroll-y class="category-sidebar">
        <view
          v-for="root in roots"
          :key="root.id"
          class="category-tab yb-pressable"
          :class="{ active: activeRoot === root.id }"
          @click="activateRoot(root.id)"
        >
          <text>{{ root.name }}</text>
        </view>
      </scroll-view>
      <scroll-view scroll-y class="category-content" @scrolltolower="loadMore">
        <view class="category-hero">
          <view class="category-hero-copy">
            <text>精选{{ activeCategory?.name || '好物' }}</text>
            <text>{{ activePath.length > 1 ? activePath.join(' / ') : '全球直采 · 正品保障' }}</text>
          </view>
          <image :src="heroImage" mode="aspectFit" />
        </view>
        <view v-if="activeRootNode?.children?.length" class="category-tree-panel">
          <view class="category-tree-head">
            <text class="category-tree-title">选择分类</text>
            <view
              class="category-all yb-pressable"
              :class="{ active: activeCategoryId === activeRootNode.id }"
              @click="activateCategory(activeRootNode.id)"
            >全部{{ activeRootNode.name }}</view>
          </view>
          <view v-for="group in activeRootNode.children" :key="group.id" class="category-group">
            <view
              class="category-group-title yb-pressable"
              :class="{ active: activeCategoryId === group.id }"
              @click="activateCategory(group.id)"
            >
              <text>{{ group.name }}</text>
              <text v-if="group.children?.length">{{ group.children.length }} 个分类</text>
            </view>
            <view v-if="group.children?.length" class="category-leaves">
              <view
                v-for="leaf in group.children"
                :key="leaf.id"
                class="category-leaf yb-pressable"
                :class="{ active: activeCategoryId === leaf.id }"
                @click="activateCategory(leaf.id)"
              >{{ leaf.name }}</view>
            </view>
          </view>
        </view>
        <view v-if="products.length" class="product-grid">
          <ProductCard v-for="product in products" :key="String(product.id)" :product="product" />
        </view>
        <view v-else-if="loading" class="category-loading"><wd-loading size="44rpx" /><text>正在加载商品</text></view>
        <EmptyState v-else title="该分类暂无商品" />
      </scroll-view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.category-page { height: 100%; overflow: hidden; background: var(--yb-bg); }
.category-layout { display: flex; height: 100%; min-height: 0; }
.category-sidebar { width: 176rpx; flex-shrink: 0; height: 100%; border-right: 1rpx solid var(--yb-hairline); background: var(--yb-surface); }
.category-tab { position: relative; display: flex; align-items: center; justify-content: center; min-height: 96rpx; padding: 16rpx 12rpx; color: var(--yb-ink-2); font-size: var(--yb-fs-body); line-height: 36rpx; text-align: center; }
.category-tab.active { background: #fff5f6; color: var(--yb-ink); font-weight: 600; }
.category-tab.active::before { position: absolute; top: 20rpx; bottom: 20rpx; left: 0; width: 6rpx; border-radius: var(--yb-radius-pill); background: var(--yb-brand); content: ''; }
.category-content { flex: 1; height: 100%; min-width: 0; padding: 20rpx 16rpx 32rpx; box-sizing: border-box; }
.category-hero { position: relative; display: flex; align-items: center; min-height: 184rpx; overflow: hidden; padding: 24rpx 22rpx; border-radius: 24rpx; background: #fff0f1; }
.category-hero::after { position: absolute; right: -80rpx; bottom: -110rpx; width: 290rpx; height: 290rpx; border-radius: 50%; background: rgba(250, 36, 60, .08); content: ''; }
.category-hero-copy { position: relative; z-index: 1; display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 12rpx; }
.category-hero-copy text:first-child { color: var(--yb-ink); font-size: 38rpx; font-weight: 700; line-height: 48rpx; }
.category-hero-copy text:last-child { color: var(--yb-muted); font-size: var(--yb-fs-body); }
.category-hero image { position: relative; z-index: 1; width: 180rpx; height: 166rpx; }
.category-tree-panel { margin-top: 20rpx; padding: 20rpx; border: 1rpx solid var(--yb-hairline); border-radius: 20rpx; background: var(--yb-surface); }
.category-tree-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.category-tree-title { color: var(--yb-ink); font-size: var(--yb-fs-title-sm); font-weight: 700; }
.category-all { display: flex; align-items: center; min-height: 40px; padding: 0 20rpx; border-radius: var(--yb-radius-pill); background: var(--yb-bg); color: var(--yb-ink-2); font-size: var(--yb-fs-body-sm); }
.category-all.active { background: var(--yb-brand); color: var(--yb-surface); }
.category-group { margin-top: 22rpx; }
.category-group-title { display: flex; align-items: center; justify-content: space-between; min-height: 40px; color: var(--yb-ink); font-size: var(--yb-fs-body); font-weight: 600; }
.category-group-title > text:last-child { color: var(--yb-muted); font-size: var(--yb-fs-caption); font-weight: 400; }
.category-group-title.active > text:first-child { color: var(--yb-brand); }
.category-leaves { display: flex; flex-wrap: wrap; gap: 12rpx; }
.category-leaf { display: flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 18rpx; border: 1rpx solid var(--yb-hairline); border-radius: 14rpx; background: var(--yb-bg); color: var(--yb-ink-2); font-size: var(--yb-fs-body-sm); }
.category-leaf.active { border-color: var(--yb-brand); background: #fff5f6; color: var(--yb-brand); font-weight: 600; }
.product-grid { display: flex; flex-wrap: wrap; margin-top: 20rpx; gap: 16rpx; }
.product-grid > * { width: calc((100% - 16rpx) / 2); min-width: 0; }
.category-loading { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; color: var(--yb-muted); font-size: var(--yb-fs-body-sm); gap: 16rpx; }
</style>
