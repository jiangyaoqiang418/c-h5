<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { productApi } from '@shared';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import CustomTabBar from '@/components/layout/custom-tab-bar.vue';

interface CategoryNode {
  id: number;
  name: string;
  level: number;
  children?: CategoryNode[];
}

const roots = ref<CategoryNode[]>([]);
const activeRoot = ref<number>();
const products = ref<Api.Product.ProductRecord[]>([]);
const loading = ref(false);

async function load(id?: number) {
  loading.value = true;
  try {
    const r = await productApi.fetchProductList({ categoryId: id, size: 30 });
    products.value = r.records;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  roots.value = ((await productApi.fetchCategoryTree()) as CategoryNode[]).slice(0, 12);
  if (roots.value.length) {
    activeRoot.value = roots.value[0].id;
    load(activeRoot.value);
  }
});

watch(activeRoot, id => load(id));
</script>

<template>
  <view class="cat-page">
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
      <scroll-view scroll-y class="content">
        <view v-if="products.length" class="grid">
          <ProductCard v-for="p in products" :key="p.id" :product="p" />
        </view>
        <EmptyState v-else-if="!loading" title="该分类暂无商品" />
      </scroll-view>
    </view>
    <CustomTabBar current="category" />
  </view>
</template>

<style lang="scss" scoped>
.cat-page {
  height: 100vh;
  background: #f7f8fa;
  padding-bottom: 120rpx;
  box-sizing: border-box;
}
.layout {
  display: flex;
  height: 100%;
}
.side {
  width: 180rpx;
  background: #fff;
  border-right: 1rpx solid #f2f3f5;
}
.root-row {
  padding: 28rpx 24rpx;
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
  padding: 16rpx;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
</style>
