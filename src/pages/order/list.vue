<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchBoughtOrders, fetchSoldOrders, fetchOrderDetail, shipRealOrder, uploadOrderVoucher, orderRole } from '@/service/api/order';
import { usePageOperation } from '@/utils/page-operation';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';
import { changeOrderWithReceipt, orderChangeBlocks, orderChangeMessage, readOrderChangeReceipts, reconcileOrderChange, type OrderChangeReceipt } from '@/utils/order-change';
import { readRefundCreateReceipts, refundCreationBlocks, type RefundCreateReceipt } from '@/utils/refund-create';
import { confirmOrderGroupPayment, paymentReceiptMessage, readPaymentReceipts, reconcileOrderGroupPayment, type PaymentReceipt } from '@/utils/order-payment';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go, useNavigationGuards } from '@/utils/navigate';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  status?: Api.RealOrder.OrderStatus;
}
const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款', status: 'CREATED' },
  { key: 'ship', label: '待发货', status: 'PAID' },
  { key: 'transit', label: '待收货', status: 'SHIPPED' },
  { key: 'done', label: '已完成', status: 'COMPLETED' }
];

const activeKey = ref('all');
onLoad(query => { activeKey.value = TABS.find(tab => tab.status === query?.status)?.key || 'all'; });
const orders = ref<Api.RealOrder.OrderView[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const paying = ref(false);
const shippingOrder = ref<Api.RealOrder.OrderView>();
const shippingPopupVisible = ref(false);
const shippingSubmitting = ref(false);
const shippingForm = ref<{ carrier: Api.RealOrder.CarrierType; carrierName: string; trackingNo: string; purchaseNo: string; remark: string }>({ carrier: 'SF', carrierName: '', trackingNo: '', purchaseNo: '', remark: '' });
const purchaseVouchers = ref<string[]>([]);
const shipVouchers = ref<string[]>([]);
const voucherUploading = ref(false);
let loadToken = 0;
const pageNo = ref(0);
const total = ref(0);
let filterVersion = 0;
let shippingVersion = 0;
let retryReset = true;
const receipts = ref(new Map<string, Api.RealOrder.OrderStatus>());
const changeReceipts = ref<OrderChangeReceipt[]>([]);
const changeReceiptFailed = ref(false);
const refundReceipts = ref<RefundCreateReceipt[]>([]);
const refundReceiptFailed = ref(false);
const paymentReceipts = ref<PaymentReceipt[]>([]);
const paymentReceiptFailed = ref(false);
const uncertainShipping = ref(new Set<string>());
const busy = computed(() => paying.value || shippingSubmitting.value || voucherUploading.value);
const page = usePageOperation(() => {
  loadToken++; filterVersion++; shippingVersion++;
  orders.value = []; total.value = 0; pageNo.value = 0;
  loading.value = false; loadFailed.value = false;
  paying.value = false; shippingSubmitting.value = false; voucherUploading.value = false;
  receipts.value = new Map();
  changeReceipts.value = []; changeReceiptFailed.value = false;
  refundReceipts.value = []; refundReceiptFailed.value = false;
  paymentReceipts.value = []; paymentReceiptFailed.value = false;
  uncertainShipping.value = new Set();
  closeShipping();
});
function closeShipping() {
  shippingPopupVisible.value = false;
  shippingOrder.value = undefined;
  purchaseVouchers.value = []; shipVouchers.value = [];
  shippingForm.value = { carrier: 'SF', carrierName: '', trackingNo: '', purchaseNo: '', remark: '' };
}
watch(shippingPopupVisible, visible => { if (!visible) shippingVersion++; }, { flush: 'sync' });
function canOperate(o: Api.RealOrder.OrderView, role: 'customer' | 'seller', status: Api.RealOrder.OrderStatus) {
  return page.visible.value && !busy.value && !loading.value && !loadFailed.value
    && orders.value.includes(o) && orderRole(o, userStore.realUserId) === role && o.rawStatus === status
    && receipts.value.get(String(o.id)) !== status && !paymentBlocked(o) && !changeBlocked(o);
}

function changeBlocked(order: Api.RealOrder.OrderView) {
  return orderRole(order, userStore.realUserId) === 'customer' && (refundReceiptFailed.value || refundCreationBlocks(order.id, refundReceipts.value)
    || changeReceiptFailed.value || orderChangeBlocks(order, changeReceipts.value));
}
function refreshChangeReceipts() {
  try {
    changeReceipts.value = userStore.realUserId ? readOrderChangeReceipts(userStore.realUserId) : [];
    changeReceiptFailed.value = false;
  } catch { changeReceiptFailed.value = true; }
  try {
    refundReceipts.value = userStore.realUserId ? readRefundCreateReceipts(userStore.realUserId) : [];
    refundReceiptFailed.value = false;
  } catch { refundReceiptFailed.value = true; }
}

function paymentBlocked(order: Api.RealOrder.OrderView) {
  return orderRole(order, userStore.realUserId) === 'customer' && order.rawStatus === 'CREATED'
    && (paymentReceiptFailed.value || paymentReceipts.value.some(receipt => receipt.orderGroupNo === order.orderGroupNo));
}
function refreshPaymentReceipts() {
  try {
    paymentReceipts.value = userStore.realUserId ? readPaymentReceipts(userStore.realUserId) : [];
    paymentReceiptFailed.value = false;
  } catch { paymentReceiptFailed.value = true; }
}

async function load(reset = true) {
  if (!page.visible.value || (!reset && (loading.value || pageNo.value * 30 >= total.value))) return;
  const targetPage = reset ? 1 : pageNo.value + 1;
  const operation = page.capture();
  const filter = filterVersion;
  const tab = TABS.find(t => t.key === activeKey.value);
  const seller = userStore.isBuyerActive;
  const token = ++loadToken;
  retryReset = reset;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!operation.isCurrent() || token !== loadToken || filter !== filterVersion) return;
    if (!userStore.currentUser) {
      orders.value = []; total.value = 0; pageNo.value = 0;
      if (getAccessToken()) throw new Error('账户资料暂未加载成功，请重试');
      return;
    }
    refreshPaymentReceipts();
    refreshChangeReceipts();
    const query = { pageNo: targetPage, pageSize: 30, status: tab?.status };
    const r = seller ? await fetchSoldOrders(query) : await fetchBoughtOrders(query);
    if (token === loadToken && operation.isCurrent() && filter === filterVersion) {
      const count = Number(r.total);
      if (!Number.isFinite(count) || count < 0 || (!r.records.length && (targetPage - 1) * 30 < count)) throw new Error('订单分页数据不完整，请重试');
      orders.value = reset ? r.records : orders.value.concat(r.records.filter(item => !orders.value.some(existing => String(existing.id) === String(item.id))));
      pageNo.value = targetPage;
      total.value = count;
      r.records.forEach(order => { if (order.rawStatus !== 'PAID') uncertainShipping.value.delete(String(order.id)); });
    }
  } catch (error) {
    if (token !== loadToken || !operation.isCurrent()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '订单列表加载失败', icon: 'none' });
  } finally {
    if (token === loadToken) { loading.value = false; uni.stopPullDownRefresh(); }
  }
}

onShow(() => { if (!busy.value) return load(); });
onHide(() => {
  loadToken++; loading.value = false;
  // 原生相册暂时隐藏页面，允许返回同一栈页继续；普通离页关闭草稿弹层。
  if (!voucherUploading.value) closeShipping();
});
onPullDownRefresh(() => { if (!busy.value) return load(); uni.stopPullDownRefresh(); });
onReachBottom(() => { if (!busy.value && !loadFailed.value) return load(false); });
function changeFilter() {
  filterVersion++; loadToken++;
  loading.value = false; orders.value = []; total.value = 0; pageNo.value = 0;
  closeShipping();
  if (!busy.value) void load();
}
watch(activeKey, changeFilter, { flush: 'sync' });
watch(() => userStore.currentAudience, changeFilter, { flush: 'sync' });
async function retry() {
  if (busy.value) return;
  if (!userStore.currentUser && !await requireLogin('/pages/order/list')) return;
  await load(loadFailed.value ? retryReset : true);
}

async function pay(o: Api.RealOrder.OrderView) {
  if (!canOperate(o, 'customer', 'CREATED')) return;
  if (!o.orderGroupNo) {
    uni.showToast({ title: '订单组信息缺失，暂无法继续付款', icon: 'none' });
    return;
  }
  paying.value = true;
  const userId = userStore.realUserId!;
  const operation = page.capture();
  const filter = filterVersion;
  try {
    const current = () => operation.isCurrent() && filter === filterVersion;
    const receipt = await confirmOrderGroupPayment(o.orderGroupNo, userId, current);
    if (receipt && operation.sameSession()) {
      paymentReceipts.value = [...paymentReceipts.value.filter(item => item.orderGroupNo !== receipt.orderGroupNo), receipt];
      refreshPaymentReceipts();
      if (current()) {
        const checked = await reconcileOrderGroupPayment(o.orderGroupNo, userId, current);
        if (current()) {
          refreshPaymentReceipts();
          uni.showToast({ title: paymentReceiptMessage(checked || receipt), icon: 'none' });
        }
      }
    }
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '付款结果待确认，请刷新订单，勿重复创建', icon: 'none' });
  } finally {
    if (operation.sameSession() && page.visible.value) await load();
    if (operation.sameSession()) paying.value = false;
  }
}

async function changeOrder(o: Api.RealOrder.OrderView, action: 'cancel' | 'confirm') {
  const before = action === 'cancel' ? 'CREATED' : 'SHIPPED';
  if (!canOperate(o, 'customer', before)) return;
  const operation = page.capture();
  const filter = filterVersion;
  const userId = userStore.realUserId!;
  const current = () => operation.isCurrent() && filter === filterVersion;
  paying.value = true;
  try {
    const receipt = await changeOrderWithReceipt(o, action, current);
    if (!operation.sameSession()) return;
    refreshChangeReceipts();
    if (receipt && current()) {
      const checked = await reconcileOrderChange(userId, receipt, current);
      if (current()) { refreshChangeReceipts(); uni.showToast({ title: orderChangeMessage(checked || receipt), icon: 'none' }); }
    }
  } catch (error) {
    if (current()) uni.showToast({ title: error instanceof Error ? error.message : '订单操作结果待核对', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      refreshChangeReceipts();
      if (page.visible.value) await load();
      if (operation.sameSession()) paying.value = false;
    }
  }
}
function cancel(o: Api.RealOrder.OrderView) { return changeOrder(o, 'cancel'); }
function confirm(o: Api.RealOrder.OrderView) { return changeOrder(o, 'confirm'); }

function review(o: Api.RealOrder.OrderView) {
  if (!canOperate(o, 'customer', 'COMPLETED')) return;
  go(`/pages/review/write?orderId=${encodeURIComponent(String(o.id))}`);
}

function aftersale(o: Api.RealOrder.OrderView) {
  if (!['PAID', 'SHIPPED'].includes(o.rawStatus) || !canOperate(o, 'customer', o.rawStatus)) return;
  go(`/pages/aftersale/create?orderId=${o.id}`);
}

function openShipping(o: Api.RealOrder.OrderView) {
  if (!canOperate(o, 'seller', 'PAID') || uncertainShipping.value.has(String(o.id))) return;
  shippingVersion++;
  shippingOrder.value = o;
  shippingForm.value = { carrier: 'SF', carrierName: '', trackingNo: '', purchaseNo: '', remark: '' };
  purchaseVouchers.value = [];
  shipVouchers.value = [];
  shippingPopupVisible.value = true;
}

async function chooseVouchers(kind: 'purchase' | 'ship') {
  if (!page.visible.value || !shippingPopupVisible.value || !shippingOrder.value || busy.value) return;
  const orderId = shippingOrder.value.id;
  const operation = page.capture();
  const version = shippingVersion;
  const valid = () => operation.isCurrent() && shippingPopupVisible.value && version === shippingVersion && String(shippingOrder.value?.id) === String(orderId);
  const target = kind === 'purchase' ? purchaseVouchers : shipVouchers;
  const count = 6 - target.value.length;
  if (count <= 0) return;
  voucherUploading.value = true;
  try {
    const picked = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    if (!operation.afterPicker() || !valid()) return;
    const filePaths = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths : [picked.tempFilePaths];
    for (let index = 0; index < Math.min(filePaths.length, count); index += 1) {
      if (!valid()) return;
      const uploaded = await uploadOrderVoucher(filePaths[index], orderId);
      if (!valid()) return;
      if (!uploaded.url) throw new Error('凭证上传未返回可用地址，请重试');
      target.value.push(uploaded.url);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '凭证上传失败');
    if (valid() && !message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    if (operation.sameSession()) voucherUploading.value = false;
  }
}

function removeVoucher(kind: 'purchase' | 'ship', index: number) {
  if (voucherUploading.value || shippingSubmitting.value) return;
  (kind === 'purchase' ? purchaseVouchers : shipVouchers).value.splice(index, 1);
}

async function submitShipping() {
  if (!page.visible.value || busy.value || loading.value || loadFailed.value || !shippingPopupVisible.value || !shippingOrder.value
    || shippingOrder.value.rawStatus !== 'PAID' || orderRole(shippingOrder.value, userStore.realUserId) !== 'seller'
    || receipts.value.get(String(shippingOrder.value.id)) === 'PAID') return;
  if (uncertainShipping.value.has(String(shippingOrder.value.id))) return;
  if (!shippingOrder.value || !shippingForm.value.trackingNo.trim() || (shippingForm.value.carrier === 'OTHER' && !shippingForm.value.carrierName.trim())) {
    uni.showToast({ title: shippingForm.value.carrier === 'OTHER' ? '请填写承运商名称和运单号' : '请填写运单号', icon: 'none' });
    return;
  }
  shippingSubmitting.value = true;
  const operation = page.capture();
  const version = shippingVersion;
  const orderId = shippingOrder.value.id;
  let sent = false;
  const request = {
    id: orderId,
    carrier: shippingForm.value.carrier,
    carrierName: shippingForm.value.carrier === 'OTHER' ? shippingForm.value.carrierName.trim() : undefined,
    trackingNo: shippingForm.value.trackingNo.trim(),
    purchaseNo: shippingForm.value.purchaseNo.trim() || undefined,
    purchaseVouchers: [...purchaseVouchers.value],
    shipVouchers: [...shipVouchers.value],
    remark: shippingForm.value.remark.trim() || undefined
  };
  try {
    const latest = await fetchOrderDetail(orderId, 'sold', userStore.realUserId);
    if (!operation.isCurrent() || version !== shippingVersion) return;
    if (String(latest.id) !== String(orderId) || latest.rawStatus !== 'PAID' || orderRole(latest, userStore.realUserId) !== 'seller') {
      uni.showToast({ title: '订单状态或归属已变化，请刷新后重新操作', icon: 'none' });
      closeShipping();
      return;
    }
    sent = true;
    const receipt = await shipRealOrder(request);
    if (receipt == null || receipt === '') throw new Error('发货结果待核对，请刷新订单后确认');
    if (!operation.sameSession()) return;
    receipts.value.set(String(orderId), 'PAID');
    closeShipping();
    if (operation.isCurrent()) uni.showToast({ title: '已提交发货信息', icon: 'success' });
  } catch (error) {
    const unknown = sent && !(error instanceof RequestError && (error.kind === 'business' || error.kind === 'config'));
    if (unknown && operation.sameSession()) { uncertainShipping.value.add(String(orderId)); closeShipping(); }
    if (operation.isCurrent()) uni.showToast({ title: unknown ? '发货结果待核对，请刷新订单，勿重复提交' : error instanceof Error ? error.message : '发货信息提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && page.visible.value) await load();
    if (operation.sameSession()) shippingSubmitting.value = false;
  }
}
</script>

<template>
  <view class="order-list-page yb-page yb-page--full-bleed">
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
      </wd-tabs>
    </view>

    <view class="list">
      <view v-if="loading && !orders.length" class="loading"><wd-loading size="44rpx" /><text>正在加载订单</text></view>
      <view v-else-if="orders.length">
        <OrderCard
          v-for="o in orders"
          :key="o.id"
          :order="o"
          :seller-mode="userStore.isBuyerActive"
          :actions-disabled="busy || loading || loadFailed || receipts.get(String(o.id)) === o.rawStatus || uncertainShipping.has(String(o.id)) || paymentBlocked(o) || changeBlocked(o)"
          @pay="pay"
          @cancel="cancel"
          @confirm="confirm"
          @review="review"
          @aftersale="aftersale"
          @ship="openShipping"
        />
      </view>
      <EmptyState v-else-if="loadFailed" title="订单列表加载失败" description="请稍后重试" />
      <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看订单" description="当前尚未读取账号订单" action-text="登录或重试" @action="retry" />
      <EmptyState v-else title="该状态下没有订单" description="完成购物后这里会显示" />
      <wd-button v-if="loadFailed" block plain :disabled="busy" :loading="loading" @click="retry">加载失败，点击重试</wd-button>
      <view v-else-if="orders.length" class="pagination" @click="!busy && load(false)">{{ loading ? '加载中…' : pageNo * 30 < total ? '加载更多订单' : '已加载全部订单' }}</view>
    </view>

    <wd-popup v-model="shippingPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="shipping-popup">
        <text class="shipping-title">填写发货信息</text>
        <text v-if="shippingOrder" class="shipping-order">订单 {{ shippingOrder.code }}</text>
        <wd-cell title="承运商"><wd-radio-group v-model="shippingForm.carrier" inline><wd-radio value="SF">顺丰</wd-radio><wd-radio value="JD">京东</wd-radio><wd-radio value="EMS">EMS</wd-radio><wd-radio value="YTO">圆通</wd-radio><wd-radio value="ZTO">中通</wd-radio><wd-radio value="OTHER">其他</wd-radio></wd-radio-group></wd-cell>
        <wd-input v-if="shippingForm.carrier === 'OTHER'" v-model="shippingForm.carrierName" label="承运商名称" placeholder="请输入" />
        <wd-input v-model="shippingForm.trackingNo" label="运单号" placeholder="请输入真实运单号" />
        <wd-input v-model="shippingForm.purchaseNo" label="采购单号" placeholder="可选，海外采购单号" />
        <view class="voucher-field"><text class="voucher-label">采购凭证（可选，最多 6 张）</text><view class="voucher-grid"><view v-for="(url, index) in purchaseVouchers" :key="url" class="voucher-cell"><image :src="url" mode="aspectFill" class="voucher-image" /><view class="voucher-remove" @click="removeVoucher('purchase', index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="purchaseVouchers.length < 6" class="voucher-add" @click="chooseVouchers('purchase')"><wd-icon name="add" size="20px" /><text>{{ voucherUploading ? '上传中' : '添加' }}</text></view></view></view>
        <view class="voucher-field"><text class="voucher-label">发货凭证（可选，最多 6 张）</text><view class="voucher-grid"><view v-for="(url, index) in shipVouchers" :key="url" class="voucher-cell"><image :src="url" mode="aspectFill" class="voucher-image" /><view class="voucher-remove" @click="removeVoucher('ship', index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="shipVouchers.length < 6" class="voucher-add" @click="chooseVouchers('ship')"><wd-icon name="add" size="20px" /><text>{{ voucherUploading ? '上传中' : '添加' }}</text></view></view></view>
        <wd-input v-model="shippingForm.remark" label="发货备注" placeholder="可选" />
        <wd-button type="primary" block :loading="shippingSubmitting" :disabled="voucherUploading" @click="submitShipping">{{ voucherUploading ? '凭证上传中' : '确认发货' }}</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.order-list-page { min-height:100%; padding-bottom:32rpx; }
.list {
  padding: 24rpx;
}
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.shipping-popup { padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background: #fff; }
.shipping-title { display: block; font-size: 32rpx; font-weight: 700; color: #1d2129; }
.shipping-order { display: block; margin: 12rpx 0 20rpx; font-size: 22rpx; color: #86909c; font-family: ui-monospace, monospace; }
.voucher-field { padding:20rpx 32rpx; }.voucher-label { display:block; margin-bottom:12rpx; color:#4e5969; font-size:26rpx; }.voucher-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.voucher-cell,.voucher-add { width:160rpx; height:160rpx; }.voucher-cell { position:relative; }.voucher-image { width:100%; height:100%; border-radius:var(--yb-radius-md); }.voucher-remove { position:absolute; top:4rpx; right:4rpx; display:flex; align-items:center; justify-content:center; width:36rpx; height:36rpx; border-radius:50%; background:rgba(0,0,0,.55); }.voucher-add { display:flex; flex-direction:column; gap:6rpx; align-items:center; justify-content:center; box-sizing:border-box; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); background:#f7f8fa; color:#86909c; font-size:20rpx; }
</style>
