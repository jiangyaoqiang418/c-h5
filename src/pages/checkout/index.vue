<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { formatAmount } from '@/utils/format-bridge';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { go, reLaunch } from '@/utils/navigate';
import { fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { createBatchOrder, fetchBoughtOrders, fetchOrderDetail, orderRole } from '@/service/api/order';
import { getAccessToken } from '@/service/request/token';
import { confirmOrderGroupPayment, isOrderPaid, paymentReceiptMessage, readPaymentReceipts, reconcileOrderGroupPayment, type PaymentReceipt } from '@/utils/order-payment';
import { usePageOperation } from '@/utils/page-operation';
import { normalizeAmount } from '@/utils/amount';
import { useCartStore, useUserStore, useWalletStore } from '@/stores';
import { assertPendingCheckout, readPendingCheckouts, removePendingCheckout, savePendingCheckout, type PendingCheckout } from '@/utils/checkout-progress';
import { acquireOrderOperation } from '@/utils/order-operation-state';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const cart = useCartStore();
const walletStore = useWalletStore();

const addresses = ref<AddressRecord[]>([]);
const selectedAddrId = ref<Api.RealAddress.LongId>();
const agreed = ref(false);
const submitting = ref(false);
const loading = ref(false);
const loadFailed = ref(false);
const checkoutMode = ref<'cart' | 'buy-now'>('cart');
const buyNowContextId = ref('');
const guestTransferId = ref('');
let pageActive = true;
let loadVersion = 0;
let addressSelectionVersion = 0;
let returnTimer: ReturnType<typeof setTimeout> | undefined;
function clearReturnTimer() {
  if (returnTimer) clearTimeout(returnTimer);
  returnTimer = undefined;
}

const items = computed(() => {
  if (checkoutMode.value === 'buy-now') {
    const item = cart.getBuyNowItem(buyNowContextId.value);
    return item ? [item] : [];
  }
  return cart.enrichedItems.filter(item => item.selected);
});
const hasMockItems = computed(() => items.value.some(item => item.source !== 'real'));
const hasOnlyRealItems = computed(() => items.value.length > 0 && !hasMockItems.value);
const subTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.subtotal), 0).toFixed(2));
const shippingFeeTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.shippingFee), 0).toFixed(2));
const taxTotal = computed(() => items.value.reduce((sum, item) => sum + Number(item.tax), 0).toFixed(2));
const grandTotal = computed(() => (
  Number(subTotal.value) + Number(shippingFeeTotal.value) + Number(taxTotal.value)
).toFixed(2));

const pendingRecords = ref<PendingCheckout[]>([]);
const paymentReceipts = ref<PaymentReceipt[]>([]);
const paymentReceiptFailed = ref(false);
const page = usePageOperation(() => {
  addressSelectionVersion++;
  submitting.value = false;
  paymentReceipts.value = [];
  paymentReceiptFailed.value = false;
});
watch(() => userStore.realUserId, () => {
  clearReturnTimer();
  loadVersion++;
  addresses.value = [];
  selectedAddrId.value = undefined;
  pendingRecords.value = [];
  agreed.value = false;
  loading.value = false;
  loadFailed.value = true;
}, { flush: 'sync' });

function refreshPending() {
  pendingRecords.value = readPendingCheckouts().filter(item => item.userId === userStore.realUserId);
}

function refreshPaymentReceipts() {
  try {
    paymentReceipts.value = userStore.realUserId ? readPaymentReceipts(userStore.realUserId) : [];
    paymentReceiptFailed.value = false;
  } catch { paymentReceiptFailed.value = true; }
}
function pendingPaymentMessage(pending: PendingCheckout) {
  const receipt = paymentReceipts.value.find(item => item.orderGroupNo === pending.orderGroupNo);
  return receipt ? paymentReceiptMessage(receipt) : '';
}

function savePending(pending: PendingCheckout) {
  savePendingCheckout(pending);
  refreshPending();
}

function removePending(pending: PendingCheckout) {
  removePendingCheckout(pending);
  refreshPending();
}

function checkoutFingerprint() {
  return [
    ...(checkoutMode.value === 'buy-now' ? ['buy-now', buyNowContextId.value] : []),
    String(userStore.realUserId || ''),
    String(selectedAddrId.value || ''),
    ...items.value.map(item => `${item.key}:${item.qty}`).sort()
  ].join('|');
}

onLoad(query => {
  checkoutMode.value = query?.mode === 'buy-now' ? 'buy-now' : 'cart';
  buyNowContextId.value = checkoutMode.value === 'buy-now' ? String(query?.contextId || '') : '';
  guestTransferId.value = String(query?.guestTransferId || '');
});

function createIdempotencyKey() {
  return `h5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function loadCheckout() {
  clearReturnTimer();
  if (submitting.value) return;
  let version = 0;
  loading.value = true;
  loadFailed.value = false;
  try {
    cart.init();
    await userStore.init();
    if (!pageActive) return;
    version = ++loadVersion;
    loading.value = true;
    loadFailed.value = false;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料暂未加载成功，请重试；登录凭据已保留');
      const redirectUrl = checkoutMode.value === 'buy-now'
        ? `/pages/checkout/index?mode=buy-now&contextId=${encodeURIComponent(buyNowContextId.value)}`
        : `/pages/checkout/index${guestTransferId.value ? `?guestTransferId=${encodeURIComponent(guestTransferId.value)}` : ''}`;
      go('/pages/auth/login?redirect=' + encodeURIComponent(redirectUrl));
      return;
    }
    cart.init();
    if (checkoutMode.value === 'buy-now') cart.acceptGuestBuyNow(buyNowContextId.value);
    else if (guestTransferId.value) cart.acceptGuestTransfer(guestTransferId.value);
    refreshPending();
    refreshPaymentReceipts();
    if (items.value.length === 0 && !pendingRecords.value.length) {
      uni.showToast({
        title: checkoutMode.value === 'buy-now' ? '立即购买信息已失效' : '请先选择商品',
        icon: 'none'
      });
      const token = getAccessToken();
      const origin = getCurrentPages().slice(-1)[0];
      returnTimer = setTimeout(() => {
        returnTimer = undefined;
        if (!pageActive || version !== loadVersion || token !== getAccessToken() || origin !== getCurrentPages().slice(-1)[0]) return;
        if (getCurrentPages().length > 1) uni.navigateBack();
        else go('/pages/cart/index');
      }, 800);
      return;
    }
    const loadedAddresses = await fetchMyAddresses();
    if (!pageActive || version !== loadVersion) return;
    addresses.value = loadedAddresses;
    if (!addresses.value.some(address => String(address.id) === String(selectedAddrId.value))) {
      const def = addresses.value.find(a => a.isDefault) || addresses.value[0];
      selectedAddrId.value = def?.id;
    }
    await walletStore.fetchWallet();
  } catch (error) {
    if (!pageActive || (version && version !== loadVersion)) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '结算信息加载失败', icon: 'none' });
  } finally {
    if (!version || version === loadVersion) loading.value = false;
  }
}
onShow(() => { pageActive = true; loadCheckout(); });
onHide(() => { pageActive = false; loadVersion++; clearReturnTimer(); });
onUnload(() => { pageActive = false; loadVersion++; clearReturnTimer(); });

const selectedAddr = computed(() => addresses.value.find(a => String(a.id) === String(selectedAddrId.value)));
const available = computed(() => Number(walletStore.summary?.available || 0));
const balanceEnough = computed(() => available.value >= Number(grandTotal.value));

function chooseAddress() {
  if (submitting.value || !pageActive || !userStore.realUserId) return;
  const operation = page.capture();
  const userId = userStore.realUserId;
  const version = ++addressSelectionVersion;
  uni.navigateTo({
    url: `/pages/my/addresses?mode=select&selectedId=${encodeURIComponent(String(selectedAddrId.value || ''))}`,
    events: { selectAddress: (address: AddressRecord) => {
      if (!operation.sameSession() || userId !== userStore.realUserId || version !== addressSelectionVersion) return;
      addressSelectionVersion++;
      selectedAddrId.value = address.id;
    } }
  });
}

async function submit() {
  if (submitting.value || loading.value || loadFailed.value || paymentReceiptFailed.value || !pageActive || !userStore.realUserId) return;
  if (!agreed.value) {
    uni.showToast({ title: '请阅读并同意协议', icon: 'none' });
    return;
  }
  if (!selectedAddr.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' });
    return;
  }
  if (!hasOnlyRealItems.value) {
    uni.showToast({ title: '请仅选择真实商品后结算', icon: 'none' });
    return;
  }
  const operation = page.capture();
  submitting.value = true;
  try {
    const fingerprint = checkoutFingerprint();
    const userId = userStore.realUserId;
    const assertUnchanged = () => {
      if (!operation.isCurrent() || !userId || userStore.realUserId !== userId || checkoutFingerprint() !== fingerprint) throw new Error('结算内容已变化，请重新确认');
    };
    let pending = readPendingCheckouts().find(item => item.fingerprint === fingerprint && item.userId === userStore.realUserId);
    if (!pending) {
      const preview = grandTotal.value;
      const contextId = checkoutMode.value === 'buy-now' ? buyNowContextId.value : undefined;
      await cart.refreshRealItems([...items.value], contextId);
      assertUnchanged();
      if (normalizeAmount(preview) !== normalizeAmount(grandTotal.value)) {
        const result = await uni.showModal({ title: '商品费用已更新', content: `最新预估金额为 U ${grandTotal.value}，是否继续创建订单？最终付款前会再次确认服务端金额。` });
        if (!result.confirm) return;
      }
      await walletStore.refetch();
      assertUnchanged();
      if (!balanceEnough.value) {
        const result = await uni.showModal({ title: '余额不足', content: '前往链上充值？' });
        assertUnchanged();
        if (result.confirm) go('/pages/wallet/deposit');
        return;
      }
      const idempotencyKey = createIdempotencyKey();
      pending = {
        fingerprint, idempotencyKey, userId: userStore.realUserId, mode: checkoutMode.value, contextId,
        lines: items.value.map(item => ({ key: item.key, qty: item.qty })),
        request: { addressId: selectedAddr.value!.id, items: items.value.map(item => ({ productId: item.productId, quantity: item.qty })), idempotencyKey }
      };
      savePending(pending);
    }
    await executePending(pending, operation);
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({
      title: error instanceof Error ? error.message : '订单提交失败，请稍后重试',
      icon: 'none'
    });
  } finally {
    if (operation.sameSession()) { refreshPaymentReceipts(); submitting.value = false; }
  }
}

async function executePending(pending: PendingCheckout, operation = page.capture()) {
  const userId = userStore.realUserId;
  if (!operation.isCurrent() || !userId || pending.userId !== userId) throw new Error('页面或账号已变化，请重新进入结算');
  assertPendingCheckout(pending);
  readPaymentReceipts(userId);
  if (!pending.orderGroupNo) {
    if (!pending.request) throw new Error('旧结算信息不完整，请先到订单列表核对，不要重复创建');
    const group = await createBatchOrder(pending.request);
    pending.orderGroupNo = group.orderGroupNo;
    pending.orderIds = group.orderIds;
    savePending(pending);
  }
  if (!operation.isCurrent()) return;
  if (!pending.orderGroupNo || !pending.orderIds?.length) throw new Error('订单组响应不完整，请到订单列表核对');
  const fetchOrders = async () => {
    const orders = await Promise.all(pending.orderIds!.map(id => fetchOrderDetail(id)));
    if (orders.some((order, index) => String(order.id) !== String(pending.orderIds![index])
      || orderRole(order, userId) !== 'customer' || order.orderGroupNo !== pending.orderGroupNo)) throw new Error('订单记录或归属发生变化，已停止付款');
    if (pending.request && (pending.request.items.length !== orders.length || orders.some((order, index) =>
      String(order.productId) !== String(pending.request!.items[index].productId)
      || order.quantity !== (pending.request!.items[index].quantity ?? 1)))) throw new Error('订单集合与原商品或数量不一致，请先核对');
    return orders;
  };
  let orders = await fetchOrders();
  if (!operation.isCurrent()) return;
  if (orders.every(order => order.rawStatus === 'CANCELED')) {
    await closeCanceledPending(pending, fetchOrders, operation);
    return;
  }
  const existing = readPaymentReceipts(userId).find(item => item.orderGroupNo === pending.orderGroupNo);
  if (existing || !orders.every(isOrderPaid)) {
    if (orders.some(order => order.rawStatus === 'CANCELED')) throw new Error('本批存在已取消订单，请到订单列表处理剩余订单');
    const receipt = existing || await confirmOrderGroupPayment(pending.orderGroupNo, userId, operation.isCurrent);
    if (!receipt || !operation.sameSession()) return;
    paymentReceipts.value = [...paymentReceipts.value.filter(item => item.orderGroupNo !== receipt.orderGroupNo), receipt];
    refreshPaymentReceipts();
    if (!operation.isCurrent()) return;
    const checked = await reconcileOrderGroupPayment(pending.orderGroupNo, userId, operation.isCurrent);
    if (!operation.isCurrent()) return;
    refreshPaymentReceipts();
    if (checked?.state !== 'verified') {
      uni.showToast({ title: paymentReceiptMessage(checked || receipt), icon: 'none' });
      return;
    }
    orders = await fetchOrders();
    if (!operation.isCurrent()) return;
    if (!orders.every(isOrderPaid)) throw new Error('付款回执已保留，订单状态尚未全部同步，请稍后核对');
  }
  if (!operation.isCurrent()) return;
  if (pending.mode === 'buy-now' && pending.contextId) cart.clearBuyNow(pending.contextId);
  else if (pending.mode === 'cart') {
    pending.lines?.forEach(line => {
      const current = cart.enrichedItems.find(item => item.key === line.key);
      if (current?.qty === line.qty && !cart.remove(line.key)) throw new Error('订单已付款，但购物车清理失败；下单进度已保留，请核对订单后重试清理');
    });
  }
  removePending(pending);
  await walletStore.refetch().catch(() => undefined);
  if (!operation.isCurrent()) return;
  reLaunch(`/pages/checkout/success?orderId=${encodeURIComponent(String(pending.orderIds[0]))}&orderIds=${encodeURIComponent(JSON.stringify(pending.orderIds.map(String)))}`);
}

async function closeCanceledPending(pending: PendingCheckout, fetchOrders: () => Promise<Api.RealOrder.OrderView[]>, operation: ReturnType<typeof page.capture>) {
  const userId = pending.userId!;
  const groupNo = pending.orderGroupNo!;
  const release = acquireOrderOperation(userId, undefined, groupNo);
  const current = () => {
    if (!operation.isCurrent() || userId !== userStore.realUserId) throw new Error('页面或账号已变化，本次未清理');
    assertPendingCheckout(pending);
    if (readPaymentReceipts(userId).some(receipt => receipt.orderGroupNo === groupNo)) throw new Error('本组仍有付款回执，请先核对付款结果，暂不清理');
  };
  const verify = async () => {
    const ids = new Set(pending.orderIds!.map(String));
    const found = new Set<string>();
    const seen = new Set<string>();
    let expectedTotal: number | undefined;
    // 分页没有订单组查询参数；不按取消状态筛选，避免遗漏同组未取消订单。
    for (let pageNo = 1; ; pageNo++) {
      current();
      const result = await fetchBoughtOrders({ pageNo, pageSize: 50 });
      current();
      const total = Number(result.total);
      if (!['number', 'string'].includes(typeof result.total) || String(result.total).trim() === ''
        || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(result.records)
        || (expectedTotal != null && expectedTotal !== total)) throw new Error('订单分页范围发生变化或缺失，请重新核对');
      expectedTotal = total;
      for (const order of result.records) {
        const validId = typeof order.id === 'string' ? !!order.id.trim() : typeof order.id === 'number' && Number.isSafeInteger(order.id);
        if (!validId || seen.has(String(order.id))) throw new Error('订单分页记录不完整或重复，请重新核对');
        seen.add(String(order.id));
        if (order.orderGroupNo !== groupNo) continue;
        if (!ids.has(String(order.id)) || orderRole(order, userId) !== 'customer' || order.rawStatus !== 'CANCELED') throw new Error('本组仍有未取消或不匹配的订单，已保留结算进度');
        found.add(String(order.id));
      }
      if (seen.size > total) throw new Error('订单分页总数不一致，请重新核对');
      if (seen.size === total) break;
      if (!result.records.length) throw new Error('订单分页尚未完整读取，请重试');
    }
    if (found.size !== ids.size) throw new Error('未找到原订单完整集合，已保留结算进度');
    const orders = await fetchOrders();
    current();
    if (!orders.every(order => order.rawStatus === 'CANCELED')) throw new Error('原订单状态发生变化，本次未清理');
  };
  try {
    await verify();
    const answer = await uni.showModal({ title: '订单已全部取消，清理本机结算进度？', content: `已核对本组 ${pending.orderIds!.length} 笔订单全部取消。仅清理这组本机进度，不删除商品、不删除后台订单，也不会重新下单。` });
    if (!answer.confirm) return;
    current();
    await verify();
    removePending(pending);
    uni.showToast({ title: '已清理这组已取消结算，商品已保留', icon: 'none' });
  } finally { release(); }
}

async function resumePending(pending: PendingCheckout) {
  if (submitting.value || !pageActive) return;
  const operation = page.capture();
  submitting.value = true;
  try {
    if (!pending.orderGroupNo) {
      const result = await uni.showModal({ title: '恢复上次下单？', content: '将使用上次保存的商品、数量和地址核对原请求，不会使用当前购物车重新建单。付款前仍需确认。' });
      if (!result.confirm || !operation.isCurrent()) return;
    }
    await executePending(pending, operation);
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '结果待确认，请到订单列表核对', icon: 'none' });
  } finally {
    if (operation.sameSession()) { refreshPaymentReceipts(); submitting.value = false; }
  }
}
</script>

<template>
  <view class="checkout-page yb-page">
    <wd-button v-if="paymentReceiptFailed" block plain :disabled="submitting" @click="loadCheckout">付款回执读取失败，已暂停付款，点击重新读取</wd-button>
    <view v-if="pendingRecords.length" class="block">
      <text class="block-title">未完成的结算</text>
      <view v-for="pending in pendingRecords" :key="pending.idempotencyKey" class="pay-row">
        <text>{{ pending.orderGroupNo ? `订单组 ${pending.orderGroupNo}` : '上次下单结果待确认' }}</text>
        <text v-if="pendingPaymentMessage(pending)">{{ pendingPaymentMessage(pending) }}</text>
        <wd-button size="small" plain :disabled="submitting" @click="resumePending(pending)">核对并继续</wd-button>
      </view>
      <wd-button size="small" plain @click="go('/pages/order/list')">查看订单</wd-button>
    </view>
    <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载结算信息</text></view>
    <EmptyState v-else-if="loadFailed" title="结算信息加载失败" description="请稍后重试" action-text="重新加载" @action="loadCheckout" />
    <template v-else>
    <view class="block">
      <text class="block-title">1. 收货地址</text>
      <view v-if="selectedAddr" class="addr">
        <text class="receiver">{{ selectedAddr.receiverName }} · {{ selectedAddr.receiverPhone }}</text>
        <text class="detail">{{ selectedAddr.province }} {{ selectedAddr.city }} {{ selectedAddr.district }} {{ selectedAddr.detail }}</text>
        <wd-button plain size="small" @click="chooseAddress">更换地址</wd-button>
      </view>
      <view v-else class="addr empty">
        <text>暂无地址</text>
        <wd-button type="primary" size="small" @click="chooseAddress">新增地址</wd-button>
      </view>
    </view>

    <view class="block">
      <text class="block-title">2. 商品清单 ({{ items.length }})</text>
      <view v-for="item in items" :key="item.key" class="goods-row">
        <image
          :src="item.product?.cover || UI_ASSETS.placeholders.product"
          class="goods-cover"
          mode="aspectFill"
        />
        <view class="goods-info">
          <text class="goods-title">{{ item.product?.title }}</text>
          <text class="goods-seller">买手 · {{ item.product?.sellerName }}</text>
        </view>
        <view class="goods-amount">
          <text class="goods-qty">×{{ item.qty }}</text>
          <text class="goods-price-cny">{{ formatUsdt(item.lineTotal) }}</text>
          <text class="goods-price-usdt">≈ {{ formatCny(item.lineTotal) }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <text class="block-title">3. 金额明细</text>
      <view class="amount-row">
        <text class="am-lbl">商品合计</text>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(subTotal) }}</text>
          <text class="am-usdt">≈ {{ formatCny(subTotal) }}</text>
        </view>
      </view>
      <view class="amount-row">
        <text class="am-lbl">运费</text>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(shippingFeeTotal) }}</text>
        </view>
      </view>
      <view class="amount-row">
        <view class="am-lbl with-tip"><text>税费</text><InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></view>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(taxTotal) }}</text>
        </view>
      </view>
      <view class="amount-row total">
        <text class="am-lbl">应付总额</text>
        <view class="am-val">
          <text class="am-cny total-big">{{ formatUsdt(grandTotal) }}</text>
          <text class="am-usdt">≈ {{ formatCny(grandTotal) }} · {{ priceSet(grandTotal).rateLabel }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <text class="block-title">4. 支付方式</text>
      <view class="pay-row">
        <text>钱包可用余额：U {{ formatAmount(available.toFixed(2)) }}</text>
        <text v-if="!balanceEnough" class="insufficient">· 余额不足</text>
      </view>
    </view>

    <view class="agree-row">
      <wd-checkbox v-model="agreed" shape="square">
        <text>我已阅读并同意《用户协议》《隐私政策》</text>
      </wd-checkbox>
    </view>

    <view class="footer-space" />

    <view class="bottom-bar">
      <view class="total-block">
        <text class="total-label">应付：</text>
        <text class="total-val">{{ formatUsdt(grandTotal) }}</text>
        <text class="total-usdt">≈ {{ formatCny(grandTotal) }}</text>
      </view>
      <wd-button type="primary" size="large" :loading="submitting" :disabled="!agreed || !hasOnlyRealItems" @click="submit">提交订单</wd-button>
    </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.checkout-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.block {
  background: #fff;
  margin-bottom: 20rpx;
  padding: 24rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.block-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
  padding-left: 16rpx;
  border-left: 6rpx solid var(--yb-brand);
}
.addr {
  padding: 16rpx 0;
}
.addr.empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.receiver {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
}
.detail {
  display: block;
  font-size: 24rpx;
  color: #4e5969;
  margin: 4rpx 0 12rpx;
}
.goods-row {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx dashed #f2f3f5;
}
.goods-row:last-child {
  border-bottom: none;
}
.goods-cover {
  width: 100rpx;
  height: 100rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
  min-width: 0;
}
.goods-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 24rpx;
  color: #1d2129;
}
.goods-seller {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.goods-amount {
  text-align: right;
  font-size: 24rpx;
  color: #4e5969;
}
.goods-price {
  display: block;
  color: #f53f3f;
  font-weight: 700;
  margin-top: 4rpx;
}
.amount-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.amount-row.total {
  font-weight: 700;
  color: #f53f3f;
  font-size: 28rpx;
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
}
.with-tip { display: flex; align-items: center; gap: 4rpx; }
.pay-row {
  font-size: 26rpx;
  color: #1d2129;
}
.insufficient {
  color: #f53f3f;
  margin-left: 8rpx;
}
.agree-row { background:#fff; padding:24rpx; font-size:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.footer-space { display: none; }
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid var(--yb-border);
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.total-block {
  flex: 1;
}
.total-label {
  font-size: 24rpx;
  color: #4e5969;
}
.total-val {
  font-size: 36rpx;
  font-weight: 700;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
</style>
