<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad, onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { buyerProductActions, deleteProduct, fetchBuyerProductDetail, fetchMyProducts, setProductShelf } from '@/service/api/product';
import { fetchBuyerDepositSummary } from '@/service/api/buyer';
import { formatAmount } from '@/utils/format-bridge';
import { go, useNavigationGuards } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const activeKey = ref<Api.RealProduct.ProductQueryStatus | 'all'>('all');
const list = ref<Api.RealProduct.ProductDTO[]>([]);
const focusedId = ref('');
const focusedProduct = ref<Api.RealProduct.ProductDTO>();
const focusError = ref('');
const displayedProducts = computed(() => focusedProduct.value
  ? [focusedProduct.value, ...list.value.filter(item => String(item.id) !== String(focusedProduct.value!.id))]
  : list.value);
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
const expandedComments = ref<string[]>([]);
const deletedIds = new Set<string>();
const page = usePageOperation(() => {
  loadToken++;
  list.value = [];
  focusedId.value = ''; focusedProduct.value = undefined; focusError.value = '';
  pageNo.value = 0;
  total.value = 0;
  loading.value = false;
  loadFailed.value = false;
  operating.value = false;
  pendingShelf.value = {};
  expandedComments.value = [];
  deletedIds.clear();
  retryReset = true;
});
const actions = (product: Api.RealProduct.ProductDTO) => buyerProductActions(product, userStore.realUserId);
function toggleComment(productId: Api.RealProduct.ProductDTO['id']) {
  const key = String(productId);
  expandedComments.value = expandedComments.value.includes(key) ? expandedComments.value.filter(item => item !== key) : [...expandedComments.value, key];
}

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
        const tree = await fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: false });
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
    if (focusedId.value && !deletedIds.has(focusedId.value)) {
      try {
        const product = await fetchBuyerProductDetail(focusedId.value);
        if (!valid()) return;
        if (String(product.id) !== focusedId.value || String(product.sellerId) !== userStore.realUserId) throw new Error('通知商品不属于当前账号');
        focusedProduct.value = product; focusError.value = '';
      } catch (error) {
        if (!valid()) return;
        focusedProduct.value = undefined; focusError.value = error instanceof Error ? error.message : '通知商品读取失败';
      }
    }
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
  if (!page.visible.value || loading.value || loadFailed.value || operating.value || pendingShelf.value[String(product.id)] || deletedIds.has(String(product.id)) || !actions(product)[action] || !displayedProducts.value.includes(product)) return;
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
    const current = displayedProducts.value.find(item => String(item.id) === String(productId));
    if (!result.confirm || !operation.isCurrent() || filter !== activeKey.value || !current || current.status !== before || !actions(current)[action]) return;
    const latest = await fetchBuyerProductDetail(productId);
    if (!operation.isCurrent() || filter !== activeKey.value) return;
    if (String(latest.id) !== String(productId) || latest.status !== before || !actions(latest)[action]) {
      if (String(latest.id) === String(productId)) {
        list.value = list.value.map(item => String(item.id) === String(productId) ? latest : item);
        if (focusedId.value === String(productId)) focusedProduct.value = latest;
      }
      uni.showToast({ title: '商品状态或归属已变化，请重新确认', icon: 'none' });
      return;
    }
    if (action === 'remove') await deleteProduct(productId);
    else {
      if (onShelf) {
        const depositSummary = await fetchBuyerDepositSummary();
        if (!operation.isCurrent()) return;
        if (!depositSummary.listable) {
          uni.showToast({ title: '当前保证金不足，请先处理保证金', icon: 'none' });
          go('/pages/buyer/deposit');
          return;
        }
      }
      await setProductShelf(productId, onShelf);
    }
    if (!operation.sameSession()) return;
    if (action === 'remove') {
      deletedIds.add(String(productId));
      if (focusedId.value === String(productId)) { focusedId.value = ''; focusedProduct.value = undefined; }
      list.value = list.value.filter(item => String(item.id) !== String(productId));
    } else pendingShelf.value[String(productId)] = before;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: action === 'remove' ? '已删除' : onShelf ? '已上架' : '已下架', icon: 'success' });
    await load();
  } catch (error) {
    if (operation.isCurrent()) {
      const message = error instanceof Error ? error.message : '商品操作失败';
      if (message.length > 24) uni.showModal({ title: '操作失败', content: message, showCancel: false });
      else uni.showToast({ title: message, icon: 'none' });
    }
  } finally {
    if (operation.sameSession()) operating.value = false;
    if (operation.isCurrent() && filter !== activeKey.value) void load();
  }
}

onLoad(options => {
  if (TABS.some(tab => tab.key === options?.tab)) activeKey.value = options!.tab as typeof activeKey.value;
  if (typeof options?.productId === 'string' && options.productId.trim()) focusedId.value = options.productId;
});
onShow(() => { if (!operating.value) return load(); });
watch(activeKey, () => {
  focusedId.value = ''; focusedProduct.value = undefined; focusError.value = '';
  loadToken++;
  list.value = [];
  pageNo.value = 0;
  total.value = 0;
  loading.value = false;
  if (!operating.value) void load();
}, { flush: 'sync' });
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
      <text v-if="focusedProduct" class="focus-hint">已定位通知对应商品，当前状态以最新详情为准；解冻后需要手动上架。</text>
      <view v-if="focusError" class="focus-hint">{{ focusError }}<wd-button plain size="small" :disabled="loading || operating" @click="load()">重新定位</wd-button></view>
      <wd-button v-if="loadFailed || Object.keys(pendingShelf).length" block plain :loading="loading" :disabled="operating" @click="load(loadFailed ? retryReset : true)">{{ loadFailed ? '商品数据刷新失败，点击重试' : '商品操作已成功，点击回读最新状态' }}</wd-button>
      <view v-if="displayedProducts.length">
        <view
          v-for="product in displayedProducts"
          :key="String(product.id)"
          class="product-card"
          :class="{ focused: String(product.id) === focusedId }"
          @click="go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(product.id))}`)"
        >
          <image v-if="product.images?.[0]" :src="product.images[0]" mode="aspectFill" class="cover" />
          <view v-else class="cover placeholder">暂无图片</view>
          <view class="info">
            <text class="title">{{ product.title }}</text>
            <text class="category">{{ categoryNames[String(product.categoryId)] || '分类名称暂不可用' }}</text>
            <view class="meta">
              <view class="price"><text class="price-number">{{ formatAmount(product.price) }}</text><text class="price-unit">USDT</text></view>
              <text class="stock">库存 {{ product.stock }}</text>
            </view>
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
              <wd-button v-if="actions(product).remove" type="error" plain size="small" :disabled="operating || loading || loadFailed || !!pendingShelf[String(product.id)]" @click.stop="changeProduct(product, 'remove')">删除</wd-button>
            </view>
            <view v-if="product.reviewComment" class="comment-section" @click.stop="toggleComment(product.id)">
              <text class="review-comment" :class="{ 'review-comment--rejected': product.status === 'REJECTED', 'review-comment--collapsed': product.reviewComment.length > 60 && !expandedComments.includes(String(product.id)) }">审核意见：{{ product.reviewComment }}</text>
              <text v-if="product.reviewComment.length > 60" class="comment-toggle">{{ expandedComments.includes(String(product.id)) ? '收起审核意见' : '查看完整审核意见' }}</text>
            </view>
        </view>
      </view>
      <EmptyState v-else-if="loadFailed" title="商品列表加载失败" description="请稍后重试" />
      <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看商品" description="当前尚未读取账号商品数据" action-text="登录或重试" @action="load()" />
      <EmptyState v-else-if="!loading && activeKey !== 'all'" title="当前状态暂无商品" description="可切换其他状态，查看现有商品记录。" action-text="查看全部商品" @action="activeKey = 'all'" />
      <EmptyState v-else-if="!loading" title="还没有商品记录" description="通过下方发布商品入口填写并提交，已有审核流程保持不变。" />
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
.focus-hint { display:block; margin-bottom:16rpx; font-size:24rpx; color:#4e5969; line-height:1.6; }
.product-card.focused { border-color:var(--yb-brand); background:var(--yb-brand-soft, #fff7f4); }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:24rpx; }
.product-card {
  display: flex;
  flex-wrap:wrap;
  gap: 16rpx;
  margin-bottom: 16rpx;
  padding: 20rpx;
  background: #fff;
  border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.cover { width: 160rpx; height: 160rpx; border-radius: 12rpx; background: #f5f5f2; flex-shrink: 0; }
.cover.placeholder { display: flex; align-items: center; justify-content: center; color: var(--yb-muted); font-size: 24rpx; }
.info { flex: 1; min-width: 0; }
.title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 26rpx; font-weight: 600; line-height: 1.4; color: #1d2129; }
.category { display: block; margin-top: 4rpx; font-size: 24rpx; color: var(--yb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; flex-wrap: wrap; gap: 8rpx 16rpx; justify-content: space-between; align-items: center; margin-top: 10rpx; }
.price { display:flex; flex-wrap:wrap; align-items:baseline; gap:8rpx; min-width:0; max-width:100%; color:var(--yb-brand); font-family:var(--yb-font-body); }.price-number { min-width:0; overflow-wrap:anywhere; font-size:30rpx; font-weight:700; }.price-unit { font-size:24rpx; font-weight:500; }
.stock { font-size: 24rpx; color: #4e5969; }
.card-foot { display: flex; flex-wrap: wrap; gap: 12rpx; align-items: center; justify-content: space-between; margin-top: 10rpx; }
.review-comment { display: block; margin-top: 10rpx; font-size: 24rpx; line-height: 1.5; color: var(--yb-muted); }
.review-comment--collapsed { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.comment-toggle { display: flex; align-items: center; min-height: 84rpx; color: var(--yb-muted); font-size: 24rpx; }
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
.review-comment--rejected { color: #b42318; }
.card-foot,.comment-section { width:100%; box-sizing:border-box; }.card-foot { border-top:1rpx solid var(--yb-border); padding-top:12rpx; }.card-foot :deep(.wd-tag) { margin-right:auto; }.comment-toggle { min-height:44px; }.info { flex-basis:calc(100% - 176rpx); }
</style>
