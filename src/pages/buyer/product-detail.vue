<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { buyerProductActions, deleteProduct, fetchBuyerProductDetail, setProductShelf } from '@/service/api/product';
import { formatAmount } from '@/utils/format-bridge';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';

const { requireLogin } = useNavigationGuards();

const id = ref('');
const product = ref<Api.RealProduct.ProductDTO>();
const loading = ref(true);
const loadFailed = ref(false);
const userStore = useUserStore();
const operating = ref(false);
const deleted = ref(false);
const pendingShelf = ref<Api.RealProduct.ProductStatus>();
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  product.value = undefined;
  loading.value = false;
  loadFailed.value = true;
  operating.value = false;
  deleted.value = false;
  pendingShelf.value = undefined;
});
const actions = computed(() => buyerProductActions(product.value, userStore.realUserId));

const statusType = computed(() => {
  if (product.value?.status === 'ON_SALE') return 'success';
  if (product.value?.status === 'REVIEWING') return 'warning';
  if (product.value?.status === 'REJECTED' || product.value?.status === 'FROZEN') return 'danger';
  return 'default';
});

const afterSaleLabel = computed(() => {
  const labels: Record<Api.RealProduct.AfterSaleType, string> = {
    SEVEN_DAY_NO_REASON: '7天无理由',
    NONE: '无售后',
    SHOP_WARRANTY: '店铺保修',
    NATIONAL_WARRANTY: '全国联保'
  };
  return product.value ? labels[product.value.afterSaleType] : '';
});

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  if (!page.visible.value || deleted.value) return;
  if (!id.value) { loading.value = false; return; }
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) { await requireLogin(`/pages/buyer/product-detail?id=${encodeURIComponent(id.value)}`); return; }
    const record = await fetchBuyerProductDetail(id.value);
    if (!valid()) return;
    product.value = record;
    if (pendingShelf.value && record.status !== pendingShelf.value) pendingShelf.value = undefined;
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '商品详情加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}

async function changeProduct(action: 'shelf' | 'remove') {
  if (!page.visible.value || loading.value || loadFailed.value || operating.value || deleted.value || pendingShelf.value || !product.value || !actions.value[action]) return;
  const operation = page.capture();
  const productId = product.value.id;
  const before = product.value.status;
  const onShelf = before === 'OFF_SHELF';
  operating.value = true;
  try {
    const result = await uni.showModal(action === 'remove'
      ? { title: '删除商品？', content: '删除后商品和收藏关系将不可恢复，请确认没有未完结订单。', confirmText: '确认删除' }
      : { title: onShelf ? '确认上架' : '确认下架', content: onShelf ? '确认重新上架该商品？' : '确认下架该商品？' });
    if (!result.confirm || !operation.isCurrent() || String(product.value?.id) !== String(productId) || product.value?.status !== before || !actions.value[action]) return;
    const latest = await fetchBuyerProductDetail(productId);
    if (!operation.isCurrent()) return;
    if (String(latest.id) !== String(productId) || latest.status !== before || !buyerProductActions(latest, userStore.realUserId)[action]) {
      if (String(latest.id) === String(productId)) product.value = latest;
      uni.showToast({ title: '商品状态或归属已变化，请重新确认', icon: 'none' });
      return;
    }
    if (action === 'remove') await deleteProduct(productId);
    else await setProductShelf(productId, onShelf);
    if (!operation.sameSession()) return;
    if (action === 'remove') {
      deleted.value = true;
      product.value = undefined;
    } else pendingShelf.value = before;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: action === 'remove' ? '已删除' : onShelf ? '已上架' : '已下架', icon: 'success' });
    if (action === 'remove') {
      try {
        if (getCurrentPages().length > 1) uni.navigateBack();
        else go('/pages/buyer/products', true);
      } catch { uni.showToast({ title: '商品已删除，请手动返回列表', icon: 'none' }); }
    } else {
      await load();
    }
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '商品操作失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) operating.value = false;
  }
}

onLoad(query => { id.value = String(query?.id || ''); });
onShow(() => { if (!operating.value) return load(); });
</script>

<template>
  <view class="detail-page yb-page">
    <EmptyState v-if="deleted" title="商品已删除" description="本次删除已成功，无需再次提交" action-text="返回商品列表" @action="go('/pages/buyer/products', true)" />
    <view v-else-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载商品</text></view>
    <template v-else-if="product">
      <wd-button v-if="loadFailed || pendingShelf" block plain :loading="loading" :disabled="operating" @click="load">{{ pendingShelf ? '操作已成功，点击回读最新状态' : '详情刷新失败，点击重试' }}</wd-button>
      <swiper v-if="product.images?.length" indicator-dots class="gallery">
        <swiper-item v-for="image in product.images" :key="image">
          <image :src="image" mode="aspectFill" class="gallery-image" />
        </swiper-item>
      </swiper>

      <view class="section main-section">
        <view class="status-row">
          <wd-tag round :type="statusType">{{ product.statusText || product.status }}</wd-tag>
          <text class="stock">库存 {{ product.stock }}</text>
        </view>
        <text class="title">{{ product.title }}</text>
        <text v-if="product.brief" class="brief">{{ product.brief }}</text>
        <text class="price">U {{ formatAmount(product.price) }}</text>
      </view>

      <view v-if="product.reviewComment" class="section review-section">
        <text class="section-title">审核意见</text>
        <text class="review-text">{{ product.reviewComment }}</text>
      </view>

      <view class="section">
        <text class="section-title">商品信息</text>
        <view class="row"><text class="label">商品 ID</text><text>{{ product.id }}</text></view>
        <view class="row"><text class="label">分类 ID</text><text>{{ product.categoryId }}</text></view>
        <view class="row"><text class="label">运费</text><text>U {{ formatAmount(product.shippingFee || 0) }}</text></view>
        <view class="row"><text class="label">税费</text><text>U {{ formatAmount(product.taxFee || 0) }}</text></view>
        <view class="row"><text class="label">售后</text><text>{{ afterSaleLabel }}</text></view>
        <view class="row"><text class="label">海外过关</text><text>{{ product.overseasClearance ? '是' : '否' }}</text></view>
        <view class="row"><text class="label">创建时间</text><text>{{ formatTime(product.createdAt) }}</text></view>
      </view>

      <view class="section">
        <text class="section-title">详细描述</text>
        <text class="description">{{ product.description || '暂无详细描述' }}</text>
      </view>

      <view v-if="actions.shelf || actions.remove" class="bottom-bar">
        <wd-button v-if="actions.shelf" type="primary" block :disabled="operating || loading || loadFailed || !!pendingShelf" @click="changeProduct('shelf')">{{ product.status === 'ON_SALE' ? '下架商品' : '重新上架' }}</wd-button>
        <wd-button v-if="actions.remove" plain block :disabled="operating || loading || loadFailed || !!pendingShelf" @click="changeProduct('remove')">删除商品</wd-button>
      </view>
    </template>
    <EmptyState v-else-if="loadFailed" title="商品详情加载失败" description="请重新加载后继续" action-text="重新加载" @action="load" />
    <EmptyState v-else-if="id && !userStore.currentUser" title="请先登录查看商品" description="当前尚未读取商品详情" action-text="登录或重试" @action="load" />
    <EmptyState v-else title="商品不存在" description="商品可能已删除或链接参数不完整" />
  </view>
</template>

<style lang="scss" scoped>
.detail-page { min-height:100%; box-sizing:border-box; padding:24rpx 24rpx calc(160rpx + env(safe-area-inset-bottom)); }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:#86909c; font-size:24rpx; }
.gallery { width:100%; height:600rpx; overflow:hidden; border-radius:var(--yb-radius-lg); background:#f2f3f5; }
.gallery-image { width: 100%; height: 100%; }
.section { margin-top:20rpx; padding:24rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.main-section { margin-top:20rpx; }
.status-row { display: flex; align-items: center; justify-content: space-between; }
.stock { font-size: 22rpx; color: #86909c; }
.title { display: block; margin-top: 16rpx; font-size: 32rpx; font-weight: 700; line-height: 1.4; color: #1d2129; }
.brief { display: block; margin-top: 8rpx; font-size: 24rpx; color: #86909c; }
.price { display: block; margin-top: 20rpx; font-size: 42rpx; font-weight: 700; color: #f53f3f; font-family: ui-monospace, monospace; }
.section-title { display: block; margin-bottom: 12rpx; font-size: 28rpx; font-weight: 600; color: #1d2129; }
.row { display: flex; justify-content: space-between; gap: 24rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 24rpx; }
.row > text:last-child { min-width: 0; overflow-wrap: anywhere; text-align: right; }
.label { flex-shrink: 0; color: #86909c; }
.review-section { background: #fff7e6; }
.review-text, .description { display: block; font-size: 24rpx; line-height: 1.7; color: #4e5969; white-space: pre-wrap; }
.bottom-bar {
  position: fixed; right: 0; bottom: 0; left: 0; padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f2f3f5; background: #fff;
}
</style>
