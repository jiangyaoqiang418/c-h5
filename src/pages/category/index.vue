<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchStorefrontProducts } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { UI_ASSETS } from '@/constants/ui-assets';

const roots = ref<CategoryNode[]>([]);
const activeRoot = ref<string>();
const products = ref<Api.RealProduct.ProductListVO[]>([]);
const loading = ref(false);
const current = ref(1);
const total = ref(0);
const pageSize = 20;
let loadSequence = 0;

const activeCategory = computed(() => roots.value.find(item => item.id === activeRoot.value));
const heroImage = computed(() => products.value[0]?.coverImage || UI_ASSETS.placeholders.product);

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
  load(activeRoot.value);
}

onMounted(async () => {
  try {
    roots.value = (await fetchCategoryTree()).slice(0, 12);
    activeRoot.value = roots.value[0]?.id;
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '分类加载失败', icon: 'none' });
  }
});

watch(activeRoot, id => load(id, true));
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
          @click="activeRoot = root.id"
        >
          <text>{{ root.name }}</text>
        </view>
      </scroll-view>
      <scroll-view scroll-y class="category-content" @scrolltolower="loadMore">
        <view class="category-hero">
          <view class="category-hero-copy"><text>精选{{ activeCategory?.name || '好物' }}</text><text>全球直采 · 正品保障</text></view>
          <image :src="heroImage" mode="aspectFit" />
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
.category-sidebar { width: 180rpx; flex-shrink: 0; height: 100%; border-right: 1rpx solid var(--yb-hairline); background: var(--yb-surface); }
.category-tab { position: relative; display: flex; align-items: center; justify-content: center; min-height: 104rpx; padding: 18rpx 14rpx; color: var(--yb-ink-2); font-size: var(--yb-fs-body); line-height: 38rpx; text-align: center; }
.category-tab.active { background: #fff5f6; color: var(--yb-ink); font-weight: 600; }
.category-tab.active::before { position: absolute; top: 24rpx; bottom: 24rpx; left: 0; width: 7rpx; border-radius: var(--yb-radius-pill); background: var(--yb-brand); content: ''; }
.category-content { flex: 1; height: 100%; min-width: 0; padding: 24rpx 20rpx 32rpx; box-sizing: border-box; }
.category-hero { position: relative; display: flex; align-items: center; min-height: 184rpx; overflow: hidden; padding: 24rpx 22rpx; border-radius: 24rpx; background: #fff0f1; }
.category-hero::after { position: absolute; right: -80rpx; bottom: -110rpx; width: 290rpx; height: 290rpx; border-radius: 50%; background: rgba(250, 36, 60, .08); content: ''; }
.category-hero-copy { position: relative; z-index: 1; display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 12rpx; }
.category-hero-copy text:first-child { color: var(--yb-ink); font-size: 38rpx; font-weight: 700; line-height: 48rpx; }
.category-hero-copy text:last-child { color: var(--yb-muted); font-size: var(--yb-fs-body); }
.category-hero image { position: relative; z-index: 1; width: 180rpx; height: 166rpx; }
.product-grid { display: flex; flex-wrap: wrap; margin-top: 20rpx; gap: 16rpx; }
.product-grid > * { width: calc((100% - 16rpx) / 2); min-width: 0; }
.category-loading { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0; color: var(--yb-muted); font-size: var(--yb-fs-body-sm); gap: 16rpx; }
</style>
