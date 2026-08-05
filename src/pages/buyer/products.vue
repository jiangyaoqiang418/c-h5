<script setup lang="ts">
import { ref, watch } from 'vue';
import { onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchMyProducts, setProductShelf } from '@/service/api/product';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref<Api.RealProduct.ProductQueryStatus | 'all'>('all');
const list = ref<Api.RealProduct.ProductDTO[]>([]);
const loading = ref(false);
const pageNo = ref(1);
const total = ref(0);
const pageSize = 50;
const categoryNames = ref<Record<string, string>>({});
let loadToken = 0;

const TABS: { key: Api.RealProduct.ProductQueryStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'ON_SALE', label: '在售' },
  { key: 'OFF_SHELF', label: '已下架' },
  { key: 'REJECTED', label: '已驳回' }
];

function collectCategoryNames(nodes: CategoryNode[], parents: string[] = []) {
  nodes.forEach(node => {
    const path = [...parents, node.name];
    categoryNames.value[String(node.id)] = path.join(' / ');
    if (node.children?.length) collectCategoryNames(node.children, path);
  });
}

function statusType(status: Api.RealProduct.ProductStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'ON_SALE') return 'success';
  if (status === 'REVIEWING') return 'warning';
  if (status === 'REJECTED' || status === 'FROZEN') return 'danger';
  return 'default';
}

async function load(reset = true) {
  if (loading.value && !reset) return;
  await userStore.init();
  if (!userStore.currentUser) return;
  const targetPage = reset ? 1 : pageNo.value + 1;
  const status = activeKey.value;
  const token = ++loadToken;
  loading.value = true;
  try {
    if (!Object.keys(categoryNames.value).length) {
      collectCategoryNames(await fetchCategoryTree({ onlyEnabled: true }));
    }
    const result = await fetchMyProducts({
      pageNo: targetPage,
      pageSize,
      status: status === 'all' ? undefined : status
    });
    if (token !== loadToken) return;
    const records = result.records || [];
    list.value = reset ? records : list.value.concat(records);
    pageNo.value = result.pageNo || result.current || targetPage;
    total.value = result.total;
  } catch (error) {
    if (token !== loadToken) return;
    uni.showToast({ title: error instanceof Error ? error.message : '商品列表加载失败', icon: 'none' });
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

function toggleShelf(product: Api.RealProduct.ProductDTO) {
  const onShelf = product.status === 'OFF_SHELF';
  uni.showModal({
    title: onShelf ? '确认上架' : '确认下架',
    content: onShelf ? '重新上架后，顾客可继续购买该商品。' : '下架后，顾客将无法继续购买该商品。',
    confirmText: onShelf ? '确认上架' : '确认下架',
    success: async result => {
      if (!result.confirm) return;
      try {
        await setProductShelf(product.id, onShelf);
        uni.showToast({ title: onShelf ? '已上架' : '已下架', icon: 'success' });
        await load();
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '商品状态更新失败', icon: 'none' });
      }
    }
  });
}

onShow(load);
watch(activeKey, () => load());
onReachBottom(() => {
  if (list.value.length < total.value) load(false);
});
</script>

<template>
  <view class="products-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="tab in TABS" :key="tab.key" :name="tab.key" :title="tab.label" />
    </wd-tabs>

    <view class="list">
      <view v-if="list.length">
        <view
          v-for="product in list"
          :key="String(product.id)"
          class="product-card"
          @click="go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(product.id))}`)"
        >
          <image v-if="product.images?.[0]" :src="product.images[0]" mode="aspectFill" class="cover" />
          <view v-else class="cover placeholder">暂无图片</view>
          <view class="info">
            <text class="title">{{ product.title }}</text>
            <text class="category">{{ categoryNames[String(product.categoryId)] || `分类 ${product.categoryId}` }}</text>
            <view class="meta">
              <text class="price">U {{ formatAmount(product.price) }}</text>
              <text class="stock">库存 {{ product.stock }}</text>
            </view>
            <view class="card-foot">
              <wd-tag size="small" :type="statusType(product.status)">{{ product.statusText || product.status }}</wd-tag>
              <wd-button
                v-if="product.status === 'ON_SALE' || product.status === 'OFF_SHELF'"
                plain
                size="small"
                @click.stop="toggleShelf(product)"
              >
                {{ product.status === 'ON_SALE' ? '下架' : '上架' }}
              </wd-button>
            </view>
            <text v-if="product.reviewComment" class="review-comment">审核意见：{{ product.reviewComment }}</text>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loading" title="暂无商品" />
      <view v-if="loading" class="loading">加载中...</view>
    </view>

    <view class="fab" @click="go('/pages/buyer/product-create')">+ 发布</view>
  </view>
</template>

<style lang="scss" scoped>
.products-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 200rpx; }
.list { padding: 16rpx; }
.loading { padding: 120rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
.product-card {
  display: flex;
  gap: 16rpx;
  margin-bottom: 12rpx;
  padding: 20rpx;
  background: #fff;
  border-radius: 16rpx;
}
.cover { width: 160rpx; height: 160rpx; border-radius: 12rpx; background: #f7f8fa; flex-shrink: 0; }
.cover.placeholder { display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 20rpx; }
.info { flex: 1; min-width: 0; }
.title { display: block; font-size: 26rpx; font-weight: 600; line-height: 1.4; color: #1d2129; }
.category { display: block; margin-top: 4rpx; font-size: 22rpx; color: #86909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10rpx; }
.price { font-size: 30rpx; color: #f53f3f; font-weight: 700; font-family: ui-monospace, monospace; }
.stock { font-size: 22rpx; color: #4e5969; }
.card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; }
.review-comment { display: block; margin-top: 10rpx; font-size: 22rpx; line-height: 1.5; color: #f53f3f; }
.fab {
  position: fixed; right: 32rpx; bottom: calc(48rpx + env(safe-area-inset-bottom));
  padding: 20rpx 32rpx; border-radius: 48rpx; background: #4d80f0; color: #fff;
  font-size: 26rpx; box-shadow: 0 8rpx 24rpx rgba(77, 128, 240, 0.4);
}
</style>
