<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import { fetchOrderDetail, orderRole } from '@/service/api/order';
import { isOrderPaid } from '@/utils/order-payment';
import { sumAmounts } from '@/utils/amount';
import { UI_ASSETS } from '@/constants/ui-assets';
import { useUserStore } from '@/stores';
import { useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';

const { requireLogin } = useNavigationGuards();

const order = ref<Api.RealOrder.OrderView>();
const orderId = ref<Api.RealOrder.LongId>();
const orderIds = ref<string[]>([]);
const orders = ref<Api.RealOrder.OrderView[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const paramsInvalid = ref(false);
const userStore = useUserStore();
let loadVersion = 0;
const page = usePageOperation(() => {
  loadVersion++;
  order.value = undefined;
  orders.value = [];
  loading.value = false;
  loadFailed.value = false;
});
const paid = computed(() => !loading.value && !loadFailed.value && !paramsInvalid.value && !!userStore.currentUser
  && orders.value.length === orderIds.value.length && orders.value.length > 0
  && orders.value.every(item => isOrderPaid(item) && orderRole(item, userStore.realUserId) === 'customer'));
const total = computed(() => orders.value.length ? sumAmounts(orders.value.map(item => item.totalAmount)) : '0');
const title = computed(() => paramsInvalid.value ? '订单参数无效' : !orderIds.value.length ? '缺少订单信息'
  : loading.value ? '正在核对付款结果' : loadFailed.value ? '付款结果读取失败' : !userStore.currentUser ? '请先登录核对付款结果'
  : paid.value ? '付款已确认' : '付款尚未确认');

onLoad(query => {
  const id = query?.orderId;
  if (typeof id !== 'string' || !id) return;
  orderId.value = id;
  try {
    const ids: unknown = query?.orderIds ? JSON.parse(String(query.orderIds)) : [id];
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(value => typeof value !== 'string' || !value) || !ids.includes(id)) throw new Error('订单参数无效');
    orderIds.value = [...new Set(ids)];
  } catch {
    paramsInvalid.value = true;
  }
});
onShow(load);
onHide(() => { loadVersion++; loading.value = false; });

async function load() {
  if (!page.visible.value || loading.value || paramsInvalid.value || !orderIds.value.length) return;
  const operation = page.capture();
  const version = ++loadVersion;
  const ids = [...orderIds.value];
  const current = () => operation.isCurrent() && version === loadVersion;
  loading.value = true;
  loadFailed.value = false;
  try {
    const loggedIn = await requireLogin(`/pages/checkout/success?orderId=${encodeURIComponent(String(orderId.value))}&orderIds=${encodeURIComponent(JSON.stringify(ids))}`);
    if (!current()) return;
    if (!loggedIn) { loadFailed.value = !!getAccessToken(); return; }
    const result = await Promise.all(ids.map(id => fetchOrderDetail(id)));
    if (!current()) return;
    result.forEach((item, index) => {
      if (String(item.id) !== ids[index] || orderRole(item, userStore.realUserId) !== 'customer') throw new Error('付款订单记录或归属不匹配，请前往订单页核对');
      sumAmounts([item.totalAmount]);
    });
    orders.value = result;
    order.value = result[0];
  } catch (error) {
    if (!current()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '订单详情加载失败', icon: 'none' });
  } finally {
    if (current()) loading.value = false;
  }
}
</script>

<template>
  <view class="success-page yb-page">
    <image v-if="paid && !loading && !loadFailed" class="success-icon" :src="UI_ASSETS.illustrations.homeGuarantee" mode="aspectFit" />
    <text class="title">{{ title }}</text>
    <text v-if="order && !loadFailed && !loading" class="meta">{{ orders.length }} 笔订单 · U {{ formatAmount(total) }}</text>
    <text v-if="!paid && !loading" class="meta">请查看订单核对状态，不要重复创建订单或重复付款。</text>
    <view class="actions">
      <wd-button v-if="orderIds.length && !paramsInvalid" plain :loading="loading" @click="load">{{ userStore.currentUser ? '重新核对' : '登录或重试' }}</wd-button>
      <wd-button v-if="orders.length > 1" plain @click="go('/pages/order/list')">查看全部订单</wd-button>
      <wd-button v-if="orderId && !paramsInvalid" type="primary" @click="go(`/pages/order/detail?id=${encodeURIComponent(String(orderId))}`)">查看订单</wd-button>
      <wd-button plain @click="go('/pages/index/index')">继续购物</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.success-page {
  min-height: 100%;
  background: var(--yb-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 112rpx 32rpx calc(96rpx + env(safe-area-inset-bottom));
}
.success-icon {
  width: 168rpx;
  height: 168rpx;
  margin-bottom: 32rpx;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #151820;
}
.meta {
  font-size: 24rpx;
  color: #86909c;
  margin: 16rpx 0 48rpx;
  text-align:center;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 100%;
  max-width: 520rpx;
}
</style>
