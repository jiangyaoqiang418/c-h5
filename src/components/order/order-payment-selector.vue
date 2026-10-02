<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import { fetchOrderDetail, orderRole } from '@/service/api/order';
import { fetchLatestWalletPay, fetchWalletPayChains, validateWalletPay, type WalletPayOrder, type WalletPayChain } from '@/service/api/wallet-pay';
import { createOrderWalletPayment, hasOrderWalletAttempt } from '@/utils/order-payment';
import { walletPayEntryEnabled } from '@/utils/wallet-pay-feature';
import { usePageOperation } from '@/utils/page-operation';
import { useUserStore } from '@/stores';
import { go } from '@/utils/navigate';
const props = defineProps<{ modelValue: boolean; order?: Api.RealOrder.OrderView }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'balance', order: Api.RealOrder.OrderView): void }>();
const user = useUserStore();
const method = ref('balance');
const chain = ref('');
const chains = ref<WalletPayChain[]>([]);
const latest = ref<WalletPayOrder>();
const loading = ref(false), busy = ref(false), error = ref(''), chainError = ref('');
const activePay = computed(() => latest.value && ['PENDING', 'SUBMITTED', 'SUCCESS'].includes(latest.value.status));
let sequence = 0;
const page = usePageOperation(() => { sequence++; loading.value = false; busy.value = false; latest.value = undefined; chains.value = []; close(); });
function close() { sequence++; emit('update:modelValue', false); }
onHide(close);
async function load() {
  const operation = page.capture(), current = ++sequence, expected = props.order;
  const valid = () => operation.isCurrent() && current === sequence && props.modelValue;
  method.value = 'balance'; latest.value = undefined; chains.value = []; error.value = ''; chainError.value = '';
  if (!expected || !user.realUserId) return;
  loading.value = true;
  try {
    const detail = await fetchOrderDetail(expected.id, 'bought', user.realUserId);
    if (!valid()) return;
    if (String(detail.id) !== String(expected.id) || detail.rawStatus !== 'CREATED' || orderRole(detail, user.realUserId) !== 'customer'
      || detail.orderGroupNo !== expected.orderGroupNo) throw new Error('订单状态或归属已变化，请刷新核对');
    if (!detail.orderGroupNo) throw new Error('订单组信息缺失，暂不可付款');
    const pay = await fetchLatestWalletPay(detail.orderGroupNo);
    if (!valid()) return;
    latest.value = pay ? validateWalletPay(pay, detail.orderGroupNo) : undefined;
    if (walletPayEntryEnabled && !activePay.value) {
      try {
        const values = await fetchWalletPayChains();
        if (!valid()) return;
        chains.value = values.filter(item => item.enabled);
        chain.value = chains.value[0]?.chain || '';
      } catch { if (valid()) chainError.value = '链上支付配置读取失败，可稍后重试'; }
    }
  } catch (cause) { if (valid()) error.value = cause instanceof Error ? cause.message : '付款信息读取失败'; }
  finally { if (current === sequence) loading.value = false; }
}
watch([() => props.modelValue, () => props.order?.id, () => user.realUserId], () => { if (props.modelValue) void load(); else { sequence++; loading.value = false; } });
function viewOriginal() {
  if (!latest.value) return;
  const group = latest.value.orderGroupNo; close(); go(`/pages/checkout/wallet-pay?orderGroupNo=${encodeURIComponent(group)}`);
}
async function proceed() {
  if (busy.value || loading.value || error.value || activePay.value || !props.order) return;
  const expected = props.order, operation = page.capture(), current = sequence;
  const valid = () => operation.isCurrent() && current === sequence && props.modelValue;
  busy.value = true;
  try {
    const pay = await fetchLatestWalletPay(expected.orderGroupNo!);
    if (!valid()) return;
    latest.value = pay ? validateWalletPay(pay, expected.orderGroupNo!) : undefined;
    if (activePay.value) return;
    let checkedTerminalPayNo: string | undefined;
    if (latest.value) {
      const answer = await uni.showModal({ title: '核对原钱包付款', content: '原支付单已关闭或付款未成立，旧交易仍可能延迟到账。请先核对钱包交易和平台余额，再继续付款。', confirmText: '已核对' });
      if (!answer.confirm || !valid()) return;
      checkedTerminalPayNo = latest.value.payNo;
    }
    if (method.value === 'balance' && !latest.value && hasOrderWalletAttempt(user.realUserId!, expected.orderGroupNo!)) throw new Error('原钱包支付创建结果待核对，请选择原链重试读取支付单');
    if (method.value === 'balance') { close(); emit('balance', expected); return; }
    if (!walletPayEntryEnabled || !chain.value || chainError.value) throw new Error('请选择可用的支付链');
    const result = await createOrderWalletPayment(expected, chain.value, valid, checkedTerminalPayNo);
    if (result && valid()) { close(); go(`/pages/checkout/wallet-pay?orderGroupNo=${encodeURIComponent(result.orderGroupNo)}`); }
  } catch (cause) { if (valid()) error.value = cause instanceof Error ? cause.message : '付款结果待核对'; }
  finally { if (operation.sameSession()) busy.value = false; }
}
</script>
<template>
  <wd-popup :model-value="modelValue" position="bottom" :safe-area-inset-bottom="true" @close="close">
    <view class="payment-selector">
      <text class="title">选择支付方式</text>
      <view v-if="loading"><wd-loading /><text>正在核对订单与原支付单</text></view>
      <view v-else-if="error"><text class="error">{{ error }}</text><wd-button plain @click="load">重新核对</wd-button></view>
      <template v-else-if="activePay">
        <text>本组已有支付单：{{ latest?.statusText || latest?.status }}</text>
        <wd-button block type="primary" @click="viewOriginal">查看原支付进度</wd-button>
      </template>
      <template v-else>
        <wd-radio-group v-model="method" class="yb-choice-group">
          <wd-radio shape="dot" icon-placement="left" value="balance">站内余额支付</wd-radio>
          <wd-radio shape="dot" icon-placement="left" v-if="walletPayEntryEnabled && chains.length" value="chain">USDT 链上支付</wd-radio>
        </wd-radio-group>
        <text class="tip">余额支付需输入支付密码；余额不足可先充值。</text>
        <wd-radio-group v-if="method === 'chain'" v-model="chain" class="yb-choice-group"><wd-radio shape="dot" icon-placement="left" v-for="item in chains" :key="item.chain" :value="item.chain">{{ item.label || item.chain }}</wd-radio></wd-radio-group>
        <text v-if="method === 'chain'" class="tip">按本组全部待付款订单的剩余金额付款，需在钱包内确认并准备 Gas 币。</text>
        <text v-if="chainError" class="error">{{ chainError }}</text>
        <wd-button block type="primary" :loading="busy" @click="proceed">继续付款</wd-button>
      </template>
      <wd-button plain block :disabled="busy" @click="close">取消</wd-button>
    </view>
  </wd-popup>
</template>
<style scoped>
.payment-selector { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; }
.title { font-size: 32rpx; font-weight: 600; }
.tip, .error { font-size: 24rpx; line-height: 1.6; }
.tip { color: var(--yb-muted); }.error { color: #b42318; }
</style>
