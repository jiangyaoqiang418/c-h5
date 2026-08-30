<script setup lang="ts">
import { ref, watch } from 'vue';
import { onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { buyerProductActions, deleteProduct, fetchBuyerProductDetail, fetchMyProducts, setProductShelf } from '@/service/api/product';
import { formatAmount } from '@/utils/format-bridge';
import { go, useNavigationGuards } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const activeKey = ref<Api.RealProduct.ProductQueryStatus | 'all'>('all');
const list = ref<Api.RealProduct.ProductDTO[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const pageNo = ref(0);
const total = ref(0);
const pageSize = 50;
const categoryNames = ref<Record<string, string>>({});
let loadToken = 0;
let retryReset = true;
const operating = ref(false);
const pendingShelf = ref<Record<string, Api.RealProduct.ProductStatus>>({});
const deletedIds = new Set<string>();
const page = usePageOperation(() => {
  loadToken++;
  list.value = [];
  pageNo.value = 0;
  total.value = 0;
  loading.value = false;
  loadFailed.value = false;
  operating.value = false;
  pendingShelf.value = {};
  deletedIds.clear();
  retryReset = true;
});
const actions = (product: Api.RealProduct.ProductDTO) => buyerProductActions(product, userStore.realUserId);

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
  if (!page.visible.value || (loading.value && !reset)) return;
  if (reset) loadFailed.value = false;
  const targetPage = reset ? 1 : pageNo.value + 1;
  const status = activeKey.value;
  const token = ++loadToken;
  const operation = page.capture();
  const valid = () => operation.isCurrent() && token === loadToken;
  loading.value = true;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) { await requireLogin('/pages/buyer/products'); return; }
    if (!Object.keys(categoryNames.value).length) {
      try {
        const tree = await fetchCategoryTree({ onlyEnabled: true });
        if (!valid()) return;
        collectCategoryNames(tree);
      } catch (error) {
        if (valid()) {
          uni.showToast({ title: error instanceof Error ? error.message : '商品分类加载失败', icon: 'none' });
        }
      }
    }
    if (!valid()) return;
    const confirmed = new Map<string, Api.RealProduct.ProductDTO>();
    await Promise.all(Object.entries(pendingShelf.value).map(async ([productId]) => {
      try {
        const latest = await fetchBuyerProductDetail(productId);
        if (valid() && String(latest.id) === productId) confirmed.set(productId, latest);
      } catch { /* 操作成功回执保留，用户可以继续重试回读。 */ }
    }));
    if (!valid()) return;
    const result = await fetchMyProducts({
      pageNo: targetPage,
      pageSize,
      status: status === 'all' ? undefined : status
    });
    if (!valid()) return;
    if (result.total == null || !Number.isSafeInteger(Number(result.total)) || Number(result.total) < 0) throw new Error('商品分页总数无效，请重试');
    if (!result.records?.length && (targetPage - 1) * pageSize < Number(result.total)) throw new Error('商品分页数据不完整，请重试');
    const records = (result.records || []).filter(item => !deletedIds.has(String(item.id)));
    for (const [productId, before] of Object.entries(pendingShelf.value)) {
      const index = records.findIndex(item => String(item.id) === productId);
      const latest = confirmed.get(productId);
      if (index >= 0 && records[index].status !== before) delete pendingShelf.value[productId];
      else if (latest && latest.status !== before) {
        if (index >= 0) records[index] = latest;
        delete pendingShelf.value[productId];
      }
    }
    const merged = new Map((reset ? [] : list.value).map(item => [String(item.id), item]));
    records.forEach(item => merged.set(String(item.id), item));
    list.value = [...merged.values()];
    pageNo.value = targetPage;
    total.value = Number(result.total);
    loadFailed.value = false;
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    retryReset = reset;
    uni.showToast({ title: error instanceof Error ? error.message : '商品列表加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && token === loadToken) loading.value = false;
  }
}

async function changeProduct(product: Api.RealProduct.ProductDTO, action: 'shelf' | 'remove') {
  if (!page.visible.value || loading.value || loadFailed.value || operating.value || pendingShelf.value[String(product.id)] || deletedIds.has(String(product.id)) || !actions(product)[action] || !list.value.includes(product)) return;
  const operation = page.capture();
  const productId = product.id;
  const before = product.status;
  const filter = activeKey.value;
  const onShelf = before === 'OFF_SHELF';
  operating.value = true;
  try {
    const result = await uni.showModal(action === 'remove'
      ? { title: '删除商品？', content: '删除后商品和收藏关系将不可恢复，请确认没有未完结订单。', confirmText: '确认删除' }
      : { title: onShelf ? '确认上架' : '确认下架', content: onShelf ? '重新上架后，顾客可继续购买该商品。' : '下架后，顾客将无法继续购买该商品。', confirmText: onShelf ? '确认上架' : '确认下架' });
    const current = list.value.find(item => String(item.id) === String(productId));
    if (!result.confirm || !operation.isCurrent() || filter !== activeKey.value || !current || current.status !== before || !actions(current)[action]) return;
    const latest = await fetchBuyerProductDetail(productId);
    if (!operation.isCurrent() || filter !== activeKey.value) return;
    if (String(latest.id) !== String(productId) || latest.status !== before || !actions(latest)[action]) {
      if (String(latest.id) === String(productId)) list.value = list.value.map(item => String(item.id) === String(productId) ? latest : item);
      uni.showToast({ title: '商品状态或归属已变化，请重新确认', icon: 'none' });
      return;
    }
    if (action === 'remove') await deleteProduct(productId);
    else await setProductShelf(productId, onShelf);
    if (!operation.sameSession()) return;
    if (action === 'remove') {
      deletedIds.add(String(productId));
      list.value = list.value.filter(item => String(item.id) !== String(productId));
    } else pendingShelf.value[String(productId)] = before;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: action === 'remove' ? '已删除' : onShelf ? '已上架' : '已下架', icon: 'success' });
    await load();
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '商品操作失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) operating.value = false;
    if (operation.isCurrent() && filter !== activeKey.value) void load();
  }
}

onShow(() => { if (!operating.value) return load(); });
watch(activeKey, () => {
  loadToken++;
  list.value = [];
  pageNo.value = 0;
  total.value = 0;
  loading.value = false;
  if (!operating.value) void load();
});
onReachBottom(() => {
  if (!operating.value && !loadFailed.value && pageNo.value * pageSize < total.value) load(false);
});
</script>

<template>
  <view class="products-page yb-page yb-page--full-bleed">
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab v-for="tab in TABS" :key="tab.key" :name="tab.key" :title="tab.label" />
      </wd-tabs>
    </view>

    <view class="list">
      <wd-button v-if="loadFailed || Object.keys(pendingShelf).length" block plain :loading="loading" :disabled="operating" @click="load(loadFailed ? retryReset : true)">{{ loadFailed ? '商品数据刷新失败，点击重试' : '商品操作已成功，点击回读最新状态' }}</wd-button>
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
              <wd-tag size="small" round :type="statusType(product.status)">{{ product.statusText || product.status }}</wd-tag>
              <wd-button
                v-if="actions(product).shelf"
                plain
                size="small"
                :disabled="operating || loading || loadFailed || !!pendingShelf[String(product.id)]"
                @click.stop="changeProduct(product, 'shelf')"
              >
                {{ product.status === 'ON_SALE' ? '下架' : '上架' }}
              </wd-button>
              <wd-button v-if="actions(product).remove" plain size="small" :disabled="operating || loading || loadFailed || !!pendingShelf[String(product.id)]" @click.stop="changeProduct(product, 'remove')">删除</wd-button>
            </view>
            <text v-if="product.reviewComment" class="review-comment">审核意见：{{ product.reviewComment }}</text>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="loadFailed" title="商品列表加载失败" description="请稍后重试" />
      <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看商品" description="当前尚未读取账号商品数据" action-text="登录或重试" @action="load()" />
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
  display:flex; align-items:center; justify-content:center; min-height:44px; gap:8rpx;
  border-radius: var(--yb-radius-md); background: var(--yb-brand); color: #fff;
  font-size: 28rpx; font-weight: 600;
}
</style>
