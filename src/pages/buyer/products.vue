<script setup lang="ts">
import { ref, watch } from 'vue';
import { onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { deleteProduct, fetchMyProducts, setProductShelf } from '@/service/api/product';
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

function removeProduct(product: Api.RealProduct.ProductDTO) {
  if (product.status === 'ON_SALE') return;
  uni.showModal({ title: '删除商品？', content: '删除后商品和收藏关系将不可恢复，请确认没有未完结订单。', confirmText: '确认删除', success: async result => {
    if (!result.confirm) return;
    try { await deleteProduct(product.id); uni.showToast({ title: '已删除', icon: 'success' }); await load(); }
    catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '商品删除失败', icon: 'none' }); }
  } });
}

onShow(load);
watch(activeKey, () => load());
onReachBottom(() => {
  if (list.value.length < total.value) load(false);
});
</script>

<template>
  <view class="products-page yb-page yb-page--full-bleed">
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
              <wd-button v-if="product.status !== 'ON_SALE'" plain size="small" @click.stop="removeProduct(product)">删除</wd-button>
            </view>
            <text v-if="product.reviewComment" class="review-comment">审核意见：{{ product.reviewComment }}</text>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loading" title="暂无商品" />
      <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载商品</text></view>
    </view>

    <view class="publish-bar">
      <view class="publish-action yb-pressable" @click="go('/pages/buyer/product-create')"><wd-icon name="add" size="17px" /> <text>发布商品</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.products-page { min-height: 100%; padding-bottom: calc(144rpx + env(safe-area-inset-bottom)); }
.list { padding: 20rpx 24rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:#86909c; font-size:24rpx; }
.product-card {
  display: flex;
  gap: 16rpx;
  margin-bottom: 12rpx;
  padding: 20rpx;
  background: #fff;
  border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.cover { width: 160rpx; height: 160rpx; border-radius: 12rpx; background: #f5f5f2; flex-shrink: 0; }
.cover.placeholder { display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 20rpx; }
.info { flex: 1; min-width: 0; }
.title { display: block; font-size: 26rpx; font-weight: 600; line-height: 1.4; color: #1d2129; }
.category { display: block; margin-top: 4rpx; font-size: 22rpx; color: #86909c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10rpx; }
.price { font-size: 30rpx; color: #f53f3f; font-weight: 700; font-family: ui-monospace, monospace; }
.stock { font-size: 22rpx; color: #4e5969; }
.card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; }
.review-comment { display: block; margin-top: 10rpx; font-size: 22rpx; line-height: 1.5; color: #f53f3f; }
.publish-bar {
  position: fixed; right: 0; bottom: 0; left: 0; z-index: 20;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--yb-hairline); background: rgba(255, 255, 255, 0.98);
}
.publish-action {
  display:flex; align-items:center; justify-content:center; min-height:88rpx; gap:8rpx;
  border-radius: var(--yb-radius-md); background: var(--yb-brand); color: #fff;
  font-size: 28rpx; font-weight: 600;
}
</style>
