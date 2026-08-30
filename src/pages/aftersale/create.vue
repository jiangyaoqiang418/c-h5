<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { formatUsdt } from '@shared/utils/currency';
import { go, useNavigationGuards } from '@/utils/navigate';
import { fetchOrderDetail, orderRole } from '@/service/api/order';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { createRefundWithReceipt, readRefundCreateReceipts, reconcileRefundCreation, refundCreateMessage, type RefundCreateReceipt } from '@/utils/refund-create';

const { requireLogin } = useNavigationGuards();

const order = ref<Api.RealOrder.OrderView>();
const submitting = ref(false);
const submitted = ref(false);
const submittedId = ref<Api.RealOrder.LongId>();
const receipt = ref<RefundCreateReceipt>();
const receiptFailed = ref(false);
const reapplying = ref(false);
const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const userStore = useUserStore();
const eligible = computed(() => !!order.value && orderRole(order.value, userStore.realUserId) === 'customer' && ['PAID', 'SHIPPED'].includes(order.value.rawStatus));
const canReapply = computed(() => page.visible.value && !loading.value && !loadFailed.value && !receiptFailed.value && eligible.value
  && receipt.value?.state === 'verified' && ['CANCELED', 'REJECTED'].includes(receipt.value.refundStatus!));

const form = reactive({ reason: '' });
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  order.value = undefined;
  submitting.value = false;
  submitted.value = false;
  submittedId.value = undefined;
  receipt.value = undefined;
  receiptFailed.value = false;
  reapplying.value = false;
  loading.value = false;
  loadFailed.value = true;
  form.reason = '';
});

onLoad(query => { orderId.value = typeof query?.orderId === 'string' ? query.orderId : ''; });
function refreshReceipt() {
  try {
    const next = userStore.realUserId ? readRefundCreateReceipts(userStore.realUserId).find(item => String(item.orderId) === orderId.value) : undefined;
    if (next?.attempt !== receipt.value?.attempt) reapplying.value = false;
    receipt.value = next;
    submitted.value = !!next && !reapplying.value;
    submittedId.value = next?.state === 'verified' ? next.refundId : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
async function load() {
  if (!page.visible.value || submitting.value) return;
  if (!orderId.value) {
    loading.value = false;
    return;
  }
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      await requireLogin(`/pages/aftersale/create?orderId=${encodeURIComponent(orderId.value)}`);
      return;
    }
    refreshReceipt();
    const record = await fetchOrderDetail(orderId.value);
    if (!valid()) return;
    if (String(record.id) !== orderId.value || orderRole(record, userStore.realUserId) !== 'customer') throw new Error('订单不匹配或不属于当前顾客');
    order.value = record;
    if (receipt.value && !receiptFailed.value) {
      await reconcileRefundCreation(orderId.value, userStore.realUserId!, valid);
      if (valid()) refreshReceipt();
    }
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '订单详情加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; });

function startAgain() {
  if (!canReapply.value || submitting.value) return;
  reapplying.value = true;
  submitted.value = false;
  form.reason = '';
}

async function submit() {
  if (!page.visible.value || loading.value || loadFailed.value || receiptFailed.value || submitting.value || submitted.value || !eligible.value) return;
  if (!form.reason.trim() || form.reason.trim().length > 512) return uni.showToast({ title: '请填写不超过 512 字的退款原因', icon: 'none' });
  if (!order.value) return;
  const operation = page.capture();
  let created: RefundCreateReceipt | undefined;
  submitting.value = true;
  try {
    created = await createRefundWithReceipt(order.value, form.reason, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (created && operation.isCurrent()) uni.showToast({ title: refundCreateMessage(created), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value && receipt.value.state !== 'verified' ? refundCreateMessage(receipt.value) : error instanceof Error ? error.message : '仅退款申请提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value) await load();
      if (created && operation.isCurrent() && !loadFailed.value && !receiptFailed.value && receipt.value?.state === 'verified'
        && receipt.value.attempt === created.attempt) operation.schedule(() => go(`/pages/aftersale/detail?id=${encodeURIComponent(String(receipt.value!.refundId))}`, true), 600);
    }
  }
}
</script>

<template>
  <view class="create-page yb-page">
  <view v-if="receipt" class="step">
    <text>{{ refundCreateMessage(receipt) }}</text>
    <wd-button v-if="submittedId != null" block plain class="submit" @click="go(`/pages/aftersale/detail?id=${encodeURIComponent(String(submittedId))}`, true)">查看退款申请</wd-button>
    <wd-button block plain class="submit" :loading="loading" :disabled="submitting" @click="load">核对原申请状态</wd-button>
    <wd-button v-if="canReapply && !reapplying" block plain class="submit" @click="startAgain">重新填写申请</wd-button>
  </view>
  <wd-button v-if="receiptFailed" block plain :disabled="submitting" @click="load">本机申请记录读取失败，点击重新核对</wd-button>
  <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载可退款订单</text></view>
  <EmptyState v-else-if="loadFailed" title="可退款订单加载失败" description="请重新加载订单后继续" action-text="重新加载" @action="load" />
  <view v-else-if="order && eligible && !submitted">
    <view class="step">
      <text class="step-title">仅退款</text>
      <text>退款金额以订单应付金额为准：{{ formatUsdt(order.totalAmount) }}</text>
    </view>

    <view class="step">
      <text class="step-title">退款原因</text>
      <wd-textarea v-model="form.reason" :disabled="submitting || receiptFailed" placeholder="请说明退款原因" :max-length="512" show-word-limit />
    </view>

    <wd-button type="primary" block class="submit" :loading="submitting" :disabled="submitted || receiptFailed" @click="submit">提交申请</wd-button>
  </view>
  <EmptyState v-else-if="!userStore.currentUser && orderId" title="请先登录查看可退款订单" action-text="登录或重试" @action="load" />
  <EmptyState v-else-if="!receipt" title="缺少可退款订单" description="请从订单详情或订单列表发起仅退款" action-text="返回订单列表" @action="go('/pages/order/list', true)" />
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100%;
  padding: 24rpx;
}
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.overseas {
  background: #fff7e6;
  color: #ff7d00;
  padding: 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.step {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 20rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
}
.step-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.img-cell {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}
.img {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}
.del {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  background: rgba(0,0,0,0.55);
  color: #fff;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
}
.add {
  width: 160rpx;
  height: 160rpx;
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86909c;
  font-size: 22rpx;
}
.submit {
  margin-top: 16rpx;
}
</style>
