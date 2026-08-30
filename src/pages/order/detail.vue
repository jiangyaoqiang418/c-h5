<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { createOrderLogisticsTrack, fetchOrderDetail, fetchOrderLogistics, markOrderLogisticsException, orderRole } from '@/service/api/order';
import { confirmOrderGroupPayment, paymentReceiptMessage, readPaymentReceipts, reconcileOrderGroupPayment, type PaymentReceipt } from '@/utils/order-payment';
import { changeOrderWithReceipt, orderChangeBlocks, orderChangeMessage, readOrderChangeReceipts, reconcileOrderChange, type OrderChangeReceipt } from '@/utils/order-change';
import { readRefundCreateReceipts, refundCreationBlocks, refundCreateMessage, type RefundCreateReceipt } from '@/utils/refund-create';
import { usePageOperation } from '@/utils/page-operation';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go, useNavigationGuards } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const order = ref<Api.RealOrder.OrderView>();
const loading = ref(true);
const loadFailed = ref(false);
const id = ref<Api.RealOrder.LongId>();
const logistics = ref<Api.RealOrder.LogisticsDTO>();
const logisticsStatusLabel = computed(() => order.value?.rawStatus === 'CANCELED'
  && (!logistics.value?.logisticsStatus || logistics.value.logisticsStatus === 'PENDING_SHIPMENT')
  && !logistics.value?.trackingNo && !logistics.value?.tracks.length
  ? '订单已取消，未发货' : logistics.value?.logisticsStatusText || logistics.value?.logisticsStatus || '待发货');
const logisticsLoadFailed = ref(false);
const trackPopupVisible = ref(false);
const exceptionPopupVisible = ref(false);
const logisticsSubmitting = ref(false);
const operating = ref(false);
const isCustomer = computed(() => !!order.value && orderRole(order.value, userStore.realUserId) === 'customer');
const isSeller = computed(() => !!order.value && orderRole(order.value, userStore.realUserId) === 'seller');
let loadSequence = 0;
let popupVersion = 0;
const changeReceipts = ref<OrderChangeReceipt[]>([]);
const changeReceiptFailed = ref(false);
const currentChanges = computed(() => changeReceipts.value.filter(item => String(item.orderId) === String(id.value)));
const refundReceipt = ref<RefundCreateReceipt>();
const refundReceiptFailed = ref(false);
const refundBlocked = computed(() => refundReceiptFailed.value || (!!refundReceipt.value && refundCreationBlocks(id.value!, [refundReceipt.value])));
const paymentReceipts = ref<PaymentReceipt[]>([]);
const paymentReceiptFailed = ref(false);
const paymentReceipt = computed(() => paymentReceipts.value.find(item => item.orderGroupNo === order.value?.orderGroupNo));
const busy = computed(() => operating.value || logisticsSubmitting.value);
type LogisticsReceipt = { kind: 'track' | 'exception'; id?: Api.RealOrder.LongId; unknown: boolean; beforeException?: string; description?: string; occurredAt?: Api.RealOrder.LongId; status?: Api.RealOrder.LogisticsStatus; location?: string; exceptionNode?: boolean; exception?: string };
const logisticsReceipt = ref<LogisticsReceipt>();
const trackForm = ref<{ status: Api.RealOrder.LogisticsStatus; description: string; location: string; exceptionNode: boolean }>({ status: 'IN_TRANSIT', description: '', location: '', exceptionNode: false });
const exceptionForm = ref({ exception: '', location: '' });
const page = usePageOperation(() => {
  loadSequence++; popupVersion++;
  order.value = undefined; logistics.value = undefined;
  loading.value = false; loadFailed.value = false; logisticsLoadFailed.value = false;
  operating.value = false; logisticsSubmitting.value = false;
  changeReceipts.value = []; changeReceiptFailed.value = false; logisticsReceipt.value = undefined;
  refundReceipt.value = undefined; refundReceiptFailed.value = false;
  paymentReceipts.value = []; paymentReceiptFailed.value = false;
  closePopups();
});
const actionsDisabled = computed(() => !page.visible.value || busy.value || loading.value || loadFailed.value
  || (isCustomer.value && (refundBlocked.value || changeReceiptFailed.value || (!!order.value && orderChangeBlocks(order.value, currentChanges.value))))
  || (isCustomer.value && order.value?.rawStatus === 'CREATED' && (paymentReceiptFailed.value || !!paymentReceipt.value)));
const logisticsDisabled = computed(() => actionsDisabled.value || logisticsLoadFailed.value || !!logisticsReceipt.value);
function closePopups() {
  trackPopupVisible.value = false; exceptionPopupVisible.value = false;
  trackForm.value = { status: 'IN_TRANSIT', description: '', location: '', exceptionNode: false };
  exceptionForm.value = { exception: '', location: '' };
}
watch([trackPopupVisible, exceptionPopupVisible], () => { popupVersion++; }, { flush: 'sync' });

function refreshPaymentReceipts() {
  try {
    paymentReceipts.value = userStore.realUserId ? readPaymentReceipts(userStore.realUserId) : [];
    paymentReceiptFailed.value = false;
  } catch { paymentReceiptFailed.value = true; }
}
function refreshChangeReceipts() {
  try {
    changeReceipts.value = userStore.realUserId ? readOrderChangeReceipts(userStore.realUserId) : [];
    changeReceiptFailed.value = false;
  } catch { changeReceiptFailed.value = true; }
  try {
    refundReceipt.value = userStore.realUserId ? readRefundCreateReceipts(userStore.realUserId).find(item => String(item.orderId) === String(id.value)) : undefined;
    refundReceiptFailed.value = false;
  } catch { refundReceiptFailed.value = true; }
}

function viewOriginalRefund() {
  if (page.visible.value && !busy.value && isCustomer.value && id.value != null) go(`/pages/aftersale/create?orderId=${encodeURIComponent(String(id.value))}`);
}

onLoad(query => {
  id.value = query?.id ? String(query.id) : undefined;
});
onShow(() => { if (!busy.value) return reload(); });
onHide(() => { loadSequence++; loading.value = false; closePopups(); });

async function reload() {
  if (!page.visible.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    if (id.value == null) return;
    const orderId = id.value;
    await userStore.init();
    if (!operation.isCurrent() || sequence !== loadSequence) return;
    if (!userStore.currentUser) {
      order.value = undefined; logistics.value = undefined;
      if (getAccessToken()) throw new Error('账户资料暂未加载成功');
      await requireLogin(`/pages/order/detail?id=${encodeURIComponent(String(orderId))}`);
      return;
    }
    refreshPaymentReceipts();
    refreshChangeReceipts();
    const scope = userStore.isBuyerActive ? 'sold' : 'bought';
    const [detailResult, logisticsResult] = await Promise.allSettled([fetchOrderDetail(orderId, scope, userStore.realUserId), fetchOrderLogistics(orderId)]);
    if (sequence !== loadSequence || !operation.isCurrent()) return;
    if (detailResult.status === 'fulfilled' && String(detailResult.value.id) === String(orderId)) {
      order.value = detailResult.value;
    } else {
      loadFailed.value = true;
    }
    logisticsLoadFailed.value = logisticsResult.status === 'rejected' || (logisticsResult.status === 'fulfilled' && String(logisticsResult.value.orderId) !== String(orderId));
    if (logisticsResult.status === 'fulfilled' && !logisticsLoadFailed.value) {
      logistics.value = logisticsResult.value;
      const receipt = logisticsReceipt.value;
      if (receipt?.kind === 'track' && logistics.value.tracks.some(track => receipt.id != null
        ? String(track.trackId) === String(receipt.id)
        : String(track.occurredAt) === String(receipt.occurredAt) && track.description === receipt.description && track.status === receipt.status
          && (track.location || '') === (receipt.location || '') && !!track.exceptionNode === !!receipt.exceptionNode)) logisticsReceipt.value = undefined;
      if (receipt?.kind === 'exception' && logistics.value.logisticsException === receipt.exception
        && (!receipt.unknown || receipt.beforeException !== receipt.exception)) logisticsReceipt.value = undefined;
    }
    if (!loadFailed.value && isCustomer.value && paymentReceipt.value && !paymentReceiptFailed.value) {
      await reconcileOrderGroupPayment(paymentReceipt.value.orderGroupNo, userStore.realUserId!, () => operation.isCurrent() && sequence === loadSequence);
      if (operation.isCurrent() && sequence === loadSequence) refreshPaymentReceipts();
    }
    if (!loadFailed.value && isCustomer.value && !changeReceiptFailed.value) {
      for (const receipt of currentChanges.value) {
        if (!operation.isCurrent() || sequence !== loadSequence) return;
        if (receipt.state !== 'verified') await reconcileOrderChange(userStore.realUserId!, receipt, () => operation.isCurrent() && sequence === loadSequence);
      }
      if (operation.isCurrent() && sequence === loadSequence) refreshChangeReceipts();
    }
  } catch (error) {
    if (operation.isCurrent() && sequence === loadSequence) loadFailed.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function pay() {
  if (actionsDisabled.value || !isCustomer.value || order.value?.rawStatus !== 'CREATED') return;
  if (!order.value.orderGroupNo) {
    uni.showToast({ title: '订单组信息缺失，暂无法继续付款', icon: 'none' });
    return;
  }
  operating.value = true;
  const userId = userStore.realUserId!;
  const operation = page.capture();
  try {
    const receipt = await confirmOrderGroupPayment(order.value.orderGroupNo, userId, operation.isCurrent);
    if (receipt && operation.sameSession()) {
      paymentReceipts.value = [...paymentReceipts.value.filter(item => item.orderGroupNo !== receipt.orderGroupNo), receipt];
      refreshPaymentReceipts();
      if (operation.isCurrent()) uni.showToast({ title: paymentReceiptMessage(receipt), icon: 'none' });
    }
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '付款结果待确认，请刷新订单，勿重复创建', icon: 'none' });
  } finally {
    if (operation.sameSession() && page.visible.value) await reload();
    if (operation.sameSession()) operating.value = false;
  }
}

async function changeOrder(action: 'cancel' | 'confirm') {
  const before = action === 'cancel' ? 'CREATED' : 'SHIPPED';
  if (actionsDisabled.value || !isCustomer.value || order.value?.rawStatus !== before) return;
  const operation = page.capture();
  const expected = order.value;
  const userId = userStore.realUserId!;
  operating.value = true;
  try {
    const receipt = await changeOrderWithReceipt(expected, action, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshChangeReceipts();
    if (receipt && operation.isCurrent()) {
      const checked = await reconcileOrderChange(userId, receipt, operation.isCurrent);
      if (operation.isCurrent()) { refreshChangeReceipts(); uni.showToast({ title: orderChangeMessage(checked || receipt), icon: 'none' }); }
    }
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '订单操作结果待核对', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      refreshChangeReceipts();
      if (page.visible.value) await reload();
      if (operation.sameSession()) operating.value = false;
    }
  }
}
function cancel() { return changeOrder('cancel'); }
function confirm() { return changeOrder('confirm'); }

function goIm() {
  if (order.value) go(`/pages/im/real-order-group?orderId=${encodeURIComponent(String(order.value.id))}`);
}

function goAftersale() {
  if (!actionsDisabled.value && isCustomer.value && order.value && ['PAID', 'SHIPPED'].includes(order.value.rawStatus)) go(`/pages/aftersale/create?orderId=${order.value.id}`);
}

function goReview() {
  if (!actionsDisabled.value && isCustomer.value && order.value?.rawStatus === 'COMPLETED') go(`/pages/review/write?orderId=${encodeURIComponent(String(order.value.id))}`);
}

function openTrackPopup() {
  if (logisticsDisabled.value || !isSeller.value || order.value?.rawStatus !== 'SHIPPED') return;
  closePopups();
  trackForm.value = { status: 'IN_TRANSIT', description: '', location: '', exceptionNode: false };
  trackPopupVisible.value = true;
}

function openExceptionPopup() {
  if (logisticsDisabled.value || !isSeller.value || order.value?.rawStatus !== 'SHIPPED') return;
  closePopups();
  exceptionForm.value = { exception: '', location: '' };
  exceptionPopupVisible.value = true;
}

async function submitLogistics(kind: 'track' | 'exception') {
  if (logisticsDisabled.value || !isSeller.value || order.value?.rawStatus !== 'SHIPPED'
    || !(kind === 'track' ? trackPopupVisible.value : exceptionPopupVisible.value)) return;
  const orderId = order.value.id;
  const track = { orderId, occurredAt: Date.now(), ...trackForm.value, description: trackForm.value.description.trim(), location: trackForm.value.location.trim() || undefined };
  const exception = { orderId, exception: exceptionForm.value.exception.trim(), location: exceptionForm.value.location.trim() || undefined };
  if (!(kind === 'track' ? track.description : exception.exception)) return uni.showToast({ title: kind === 'track' ? '请填写轨迹说明' : '请填写异常说明', icon: 'none' });
  const operation = page.capture();
  const version = popupVersion;
  const receipt: LogisticsReceipt = { kind, unknown: false, beforeException: logistics.value?.logisticsException, description: track.description, occurredAt: track.occurredAt, status: track.status, location: track.location, exceptionNode: track.exceptionNode, exception: exception.exception };
  let sent = false;
  logisticsSubmitting.value = true;
  try {
    const latest = await fetchOrderDetail(orderId, 'sold', userStore.realUserId);
    if (!operation.isCurrent() || version !== popupVersion) return;
    if (String(latest.id) !== String(orderId) || latest.rawStatus !== 'SHIPPED' || orderRole(latest, userStore.realUserId) !== 'seller') throw new Error('订单状态或归属已变化，请刷新后操作');
    sent = true;
    receipt.id = kind === 'track' ? await createOrderLogisticsTrack(track) : await markOrderLogisticsException(exception);
    if (receipt.id == null || receipt.id === '') { receipt.id = undefined; throw new Error('物流提交回执缺失'); }
    if (!operation.sameSession()) return;
    logisticsReceipt.value = receipt;
    closePopups();
    if (operation.isCurrent()) uni.showToast({ title: kind === 'track' ? '物流轨迹已提交' : '物流异常已提交', icon: 'success' });
  } catch (error) {
    const unknown = sent && !(error instanceof RequestError && (error.kind === 'business' || error.kind === 'config'));
    if (unknown && operation.sameSession()) { logisticsReceipt.value = { ...receipt, unknown: true }; closePopups(); }
    if (operation.isCurrent()) uni.showToast({ title: unknown ? '物流提交结果待核对，请刷新后确认' : error instanceof Error ? error.message : '物流提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && page.visible.value) await reload();
    if (operation.sameSession()) logisticsSubmitting.value = false;
  }
}
function submitTrack() { return submitLogistics('track'); }
function submitException() { return submitLogistics('exception'); }
</script>

<template>
  <view v-if="order" class="detail-page yb-page">
    <view v-if="isCustomer && refundBlocked" class="section">
      <text>{{ refundReceiptFailed ? '本机退款申请记录读取失败，请先核对售后，暂不操作订单。' : refundReceipt ? refundCreateMessage(refundReceipt) : '' }}</text>
      <wd-button block plain :disabled="busy || loading" @click="viewOriginalRefund">核对原退款申请</wd-button>
    </view>
    <view v-if="isCustomer && (paymentReceipt || paymentReceiptFailed)" class="section">
      <text>{{ paymentReceiptFailed ? '本机付款回执读取失败，已暂停待付款操作，请先核对记录。' : paymentReceipt ? paymentReceiptMessage(paymentReceipt) : '' }}</text>
      <text v-if="paymentReceipt && order.rawStatus === 'CREATED'">当前订单仍显示待付款；这不能证明上次没有付款。</text>
      <wd-button block plain :disabled="busy" :loading="loading" @click="reload">只读核对付款状态</wd-button>
    </view>
    <view v-if="isCustomer && (changeReceiptFailed || currentChanges.length)" class="section">
      <text v-if="changeReceiptFailed">订单操作回执读取失败，已暂停操作，请先核对记录。</text>
      <text v-for="receipt in currentChanges" :key="receipt.action">{{ orderChangeMessage(receipt) }}</text>
      <text v-if="orderChangeBlocks(order, currentChanges)">当前展示可能仍为上次读取的状态，不会据此重复操作。</text>
      <wd-button block plain :disabled="busy" :loading="loading" @click="reload">只读核对订单状态</wd-button>
    </view>
    <wd-button v-if="loadFailed || logisticsLoadFailed || logisticsReceipt" block plain :disabled="busy" :loading="loading" @click="reload">{{ logisticsReceipt?.unknown ? '物流结果待核对，点击刷新' : logisticsReceipt ? '操作已提交，刷新核对最新状态' : '部分数据刷新失败，点击重试' }}</wd-button>
    <view class="hero">
      <OrderStatusTag :status="order.status" />
      <text class="code">{{ order.code }}</text>
      <text v-if="order.createdAt" class="time">{{ formatTime(order.createdAt) }}</text>
    </view>

    <view class="section">
      <text class="section-title">订单进度</text>
      <OrderTimeline :order="order" />
    </view>

    <view class="section">
      <text class="section-title">收货地址</text>
      <text class="addr-name">{{ order.receiverName }} · {{ order.receiverPhone }}</text>
      <view class="addr-detail"><wd-icon name="location" size="15px" /><text>{{ order.shippingAddress }}</text></view>
    </view>

    <view class="section goods">
      <text class="section-title">商品信息</text>
      <view class="goods-row">
        <image :src="order.productCover || UI_ASSETS.placeholders.product" mode="aspectFill" class="cover" />
        <view class="goods-info">
          <text class="g-title">{{ order.productTitle }}</text>
          <text class="g-seller">数量 {{ order.quantity ?? '待确认' }}</text>
          <text class="g-seller">{{ order.counterpartLabel }} · {{ order.counterpartName }}</text>
        </view>
        <view class="g-price-block">
          <text class="g-price-cny">{{ formatUsdt(order.price) }}</text>
          <text class="g-price-usdt">≈ {{ formatCny(order.price) }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">金额明细</text>
      <view class="amt-row">
        <text class="amt-lbl">商品小计</text>
        <view class="amt-val">
          <text class="amt-cny">{{ order.goodsAmount == null ? '待确认' : formatUsdt(order.goodsAmount) }}</text>
          <text v-if="order.goodsAmount != null" class="amt-usdt">≈ {{ formatCny(order.goodsAmount) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <text class="amt-lbl">运费</text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.shippingFee) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <view class="amt-lbl">税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></view>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.tax) }}</text>
        </view>
      </view>
      <view class="amt-row total">
        <text class="amt-lbl">合计</text>
        <view class="amt-val">
          <text class="amt-cny amt-big">{{ formatUsdt(order.totalAmount) }}</text>
          <text class="amt-usdt">≈ {{ formatCny(order.totalAmount) }} · {{ priceSet(order.totalAmount).rateLabel }}</text>
        </view>
      </view>
      <view v-if="order.originalAmount != null && Number(order.originalAmount) !== Number(order.totalAmount)" class="amt-row">
        <text class="amt-lbl">订单已改价，原始合计</text>
        <text>{{ formatUsdt(order.originalAmount) }}（以当前应付为准）</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">三方群 / 客服</text>
      <view class="link-row" @click="goIm">
        <wd-icon name="chat" size="21px" />
        <text class="link-label">打开三方群</text>
        <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
      </view>
    </view>

    <view v-if="logistics" class="section">
      <text class="section-title">物流信息</text>
      <view class="amt-row"><text class="amt-lbl">状态</text><text>{{ logisticsStatusLabel }}</text></view>
       <view v-if="logistics.carrierName || logistics.carrier" class="amt-row"><text class="amt-lbl">承运商</text><text>{{ logistics.carrierName || logistics.carrier }}</text></view>
       <view v-if="logistics.trackingNo" class="amt-row"><text class="amt-lbl">运单号</text><text>{{ logistics.trackingNo }}</text></view>
       <view v-if="logistics.purchaseNo" class="amt-row"><text class="amt-lbl">采购单号</text><text>{{ logistics.purchaseNo }}</text></view>
       <view v-if="logistics.eta" class="amt-row"><text class="amt-lbl">预计送达</text><text>{{ formatTime(logistics.eta) }}</text></view>
       <text v-if="logistics.logisticsException" class="logistics-exception">物流异常：{{ logistics.logisticsException }}</text>
       <view v-if="logistics.purchaseVouchers.length" class="voucher-section"><text class="voucher-title">采购凭证</text><view class="voucher-grid"><image v-for="(url, index) in logistics.purchaseVouchers" :key="`${url}-${index}`" :src="url" mode="aspectFill" class="voucher-image" /></view></view>
       <view v-if="logistics.shipVouchers.length" class="voucher-section"><text class="voucher-title">发货凭证</text><view class="voucher-grid"><image v-for="(url, index) in logistics.shipVouchers" :key="`${url}-${index}`" :src="url" mode="aspectFill" class="voucher-image" /></view></view>
       <view v-if="logistics.tracks.length" class="tracks"><view v-for="track in logistics.tracks" :key="String(track.trackId)" class="track"><text>{{ track.statusText || track.status }} · {{ track.description }}</text><text v-if="track.location || track.occurredAt" class="track-meta">{{ track.location || '' }} {{ formatTime(track.occurredAt) }}</text></view></view>
       <text v-else class="track-meta">暂无物流轨迹</text>
       <view v-if="isSeller && order.status === 'IN_TRANSIT'" class="logistics-actions">
         <wd-button size="small" plain :disabled="logisticsDisabled" @click="openTrackPopup">更新物流轨迹</wd-button>
         <wd-button size="small" type="error" plain :disabled="logisticsDisabled" @click="openExceptionPopup">标记物流异常</wd-button>
       </view>
     </view>
    <view v-else-if="logisticsLoadFailed" class="section logistics-load-failed">
      <text class="section-title">物流信息</text>
      <text>物流信息加载失败，请稍后重试。</text>
    </view>

    <wd-popup v-model="trackPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="logistics-popup">
        <text class="popup-title">更新物流轨迹</text>
        <wd-cell title="物流状态"><wd-radio-group v-model="trackForm.status" inline><wd-radio value="IN_TRANSIT">运输中</wd-radio><wd-radio value="DELIVERING">派送中</wd-radio><wd-radio value="SIGNED">已签收</wd-radio><wd-radio value="EXCEPTION">异常</wd-radio></wd-radio-group></wd-cell>
        <wd-input v-model="trackForm.description" label="轨迹说明" placeholder="例如：包裹已到达转运中心" />
        <wd-input v-model="trackForm.location" label="当前位置" placeholder="可选" />
        <wd-cell title="异常节点"><wd-switch v-model="trackForm.exceptionNode" /></wd-cell>
        <wd-button type="primary" block :disabled="logisticsDisabled" :loading="logisticsSubmitting" @click="submitTrack">提交轨迹</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="exceptionPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="logistics-popup">
        <text class="popup-title">标记物流异常</text>
        <wd-input v-model="exceptionForm.exception" label="异常说明" placeholder="请说明异常情况" />
        <wd-input v-model="exceptionForm.location" label="当前位置" placeholder="可选" />
        <wd-button type="error" block :disabled="logisticsDisabled" :loading="logisticsSubmitting" @click="submitException">确认标记</wd-button>
      </view>
    </wd-popup>

    <view v-if="isCustomer" class="actions-bar">
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" :disabled="actionsDisabled" type="primary" @click="pay">立即付款</wd-button>
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" :disabled="actionsDisabled" plain @click="cancel">取消订单</wd-button>
      <wd-button v-if="order.status === 'IN_TRANSIT'" :disabled="actionsDisabled" type="primary" @click="confirm">确认收货</wd-button>
      <wd-button v-if="order.status === 'COMPLETED'" :disabled="actionsDisabled" plain @click="goReview">写评价</wd-button>
      <wd-button v-if="['PROCURING', 'IN_TRANSIT'].includes(order.status)" :disabled="actionsDisabled" plain @click="goAftersale">申请仅退款</wd-button>
    </view>
  </view>
  <view v-else-if="loading" class="page-loading"><wd-loading size="44rpx" /><text>正在加载订单详情</text></view>
  <EmptyState v-else-if="loadFailed" title="订单详情加载失败" description="请检查网络后重试" action-text="重新加载" @action="reload" />
  <EmptyState v-else-if="id && !userStore.currentUser" title="请先登录查看订单" description="当前尚未读取账号订单" action-text="登录或重试" @action="reload" />
  <EmptyState v-else title="订单不存在" />
</template>

<style lang="scss" scoped>
.detail-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.hero {
  background: linear-gradient(135deg, #fff 0%, #fff4f4 100%);
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 28rpx;
  color: #1d2129;
}
.time {
  font-size: 22rpx;
  color: #86909c;
}
.section {
  background: #fff;
  margin-top: 20rpx;
  padding: 24rpx 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
}
.addr-name {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
}
.addr-detail {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  font-size: 24rpx;
  color: #4e5969;
  margin-top: 4rpx;
}
.goods-row {
  display: flex;
  gap: 16rpx;
}
.cover {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
}
.g-title {
  display: block;
  font-size: 26rpx;
}
.g-seller {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin: 4rpx 0;
}
.g-price {
  color: #f53f3f;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.amt-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.amt-row.total {
  font-weight: 700;
  color: #f53f3f;
  font-size: 28rpx;
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 0;
}
.link-label {
  flex: 1;
  font-size: 26rpx;
  color: #1d2129;
}
.logistics-exception { display:block; margin-top:12rpx; padding:16rpx; color:#f53f3f; background:#fff2f0; font-size:24rpx; line-height:1.5; }.tracks { margin-top:12rpx; }.track { padding:14rpx 0; border-top:1rpx solid #f2f3f5; font-size:24rpx; color:#1d2129; }.track-meta { display:block; margin-top:6rpx; color:#86909c; font-size:21rpx; }
.page-loading { display:flex; flex-direction:column; align-items:center; gap:16rpx; padding:120rpx 0; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }.logistics-load-failed { color:#a85a00; font-size:24rpx; }
.voucher-section { margin-top:20rpx; }.voucher-title { display:block; margin-bottom:12rpx; color:#4e5969; font-size:24rpx; }.voucher-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.voucher-image { width:160rpx; height:160rpx; border-radius:8rpx; }
.logistics-actions { display:flex; justify-content:flex-end; gap:12rpx; margin-top:20rpx; }.logistics-popup { padding:32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background:#fff; }.popup-title { display:block; margin-bottom:20rpx; color:#1d2129; font-size:32rpx; font-weight:700; }
.actions-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  gap: 12rpx;
  justify-content: flex-end;
}
</style>
