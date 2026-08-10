<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchStorefrontProducts } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const roots = ref<CategoryNode[]>([]);
const activeRoot = ref<string>();
const products = ref<Api.RealProduct.ProductListVO[]>([]);
const loading = ref(false);
const current = ref(1);
const total = ref(0);
const pageSize = 20;
let loadSequence = 0;

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
    const r = await fetchStorefrontProducts({
      categoryId: id,
      pageNo: current.value,
      pageSize,
      sortBy: 'DEFAULT'
    });
    if (sequence !== loadSequence) return;
    products.value = reset ? r.records : products.value.concat(r.records);
    total.value = r.total;
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
    if (roots.value.length) {
      activeRoot.value = roots.value[0].id;
    }
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '分类加载失败', icon: 'none' });
  }
});

watch(activeRoot, id => load(id, true));
</script>

<template>
  <view class="cat-page h5-tab-page">
    <view class="layout">
      <scroll-view scroll-y class="side">
        <view
          v-for="r in roots"
          :key="r.id"
          class="root-row"
          :class="{ active: activeRoot === r.id }"
          @click="activeRoot = r.id"
        >
          <text>{{ r.name }}</text>
        </view>
      </scroll-view>
      <scroll-view scroll-y class="content" @scrolltolower="loadMore">
        <view v-if="products.length" class="grid">
          <ProductCard v-for="p in products" :key="p.id" :product="p" />
        </view>
        <EmptyState v-else-if="!loading" title="该分类暂无商品" />
      </scroll-view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.cat-page {
  background: #f7f8fa;
  overflow: hidden !important;
}
.layout {
  display: flex;
  height: 100%;
  min-height: 0;
}
.side {
  width: 180rpx;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  /* 左侧分类栏始终填满主视图；分类较多时由 scroll-view 自身纵向滚动。 */
  background: #fff;
  border-right: 1rpx solid #f2f3f5;
}
.root-row {
  padding: 28rpx 24rpx;
  background: #fff;
  font-size: 26rpx;
  color: #4e5969;
  border-left: 4rpx solid transparent;
}
.root-row.active {
  background: #f7f8fa;
  color: #4d80f0;
  font-weight: 600;
  border-left-color: #4d80f0;
}
.content {
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 16rpx;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.grid > * {
  width: calc((100% - 16rpx) / 2);
  min-width: 0;
}
</style>
