<script setup lang="ts">
import { reactive, ref } from 'vue';

const props = defineProps<{ mode: 'wallet' | 'points'; disabled?: boolean; behaviors?: Array<{ value: string; label: string }> }>();
type Filters = Pick<Api.RealWallet.WalletLedgerPageQuery, 'balanceType' | 'keyword' | 'startAt' | 'endAt'> & Pick<Api.Point.RealLedgerQuery, 'behaviorCodes' | 'earned'>;
const emit = defineEmits<{ (event: 'apply', value: Filters): void }>();
const expanded = ref(false);
const applied = ref(false);
const draft = reactive({ balanceType: 'ALL', keyword: '', behaviorCodes: [] as string[], earned: 'ALL', startDate: '', endDate: '' });
const buckets = [
  { value: 'ALL', label: '全部账户' }, { value: 'AVAILABLE', label: '可用余额' }, { value: 'NON_WITHDRAWABLE', label: '不可提现' },
  { value: 'FINANCE_LOCKED', label: '理财锁定' }, { value: 'ORDER_FROZEN', label: '订单冻结' }, { value: 'RISK_FROZEN', label: '风控冻结' }, { value: 'DEPOSIT_AVAILABLE', label: '可用保证金' }
];
function boundary(value: string, end: boolean) {
  if (!value) return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) throw new Error('请选择有效日期');
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('日期无效');
  if (end) date.setDate(date.getDate() + 1);
  return date.getTime() - (end ? 1 : 0);
}
function apply(reset = false) {
  if (props.disabled) return;
  if (reset) Object.assign(draft, { balanceType: 'ALL', keyword: '', behaviorCodes: [], earned: 'ALL', startDate: '', endDate: '' });
  try {
    const startAt = boundary(draft.startDate, false), endAt = boundary(draft.endDate, true);
    if (startAt != null && endAt != null && startAt > endAt) throw new Error('开始日期不能晚于结束日期');
    const filters: Filters = { startAt, endAt };
    if (props.mode === 'wallet') {
      filters.balanceType = (draft.balanceType === 'ALL' ? undefined : draft.balanceType) as Filters['balanceType'];
      filters.keyword = draft.keyword.trim() || undefined;
    } else {
      filters.behaviorCodes = draft.behaviorCodes.length ? [...draft.behaviorCodes] : undefined;
      filters.earned = draft.earned === 'ALL' ? undefined : draft.earned === 'true';
    }
    emit('apply', filters);
    applied.value = Object.values(filters).some(value => value !== undefined);
    expanded.value = false;
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '筛选条件无效', icon: 'none' }); }
}
</script>

<template>
  <view class="ledger-filters">
    <wd-button plain size="small" :disabled="disabled" @click="expanded = !expanded">{{ expanded ? '收起筛选' : applied ? '筛选 · 已生效' : '筛选' }}</wd-button>
    <view v-show="expanded">
    <template v-if="mode === 'wallet'">
      <wd-picker v-model="draft.balanceType" label="账户类型" :columns="buckets" :disabled="disabled" />
      <wd-input v-model="draft.keyword" label="关键词" placeholder="业务单号或备注" :disabled="disabled" />
    </template>
    <template v-else>
      <wd-select-picker v-model="draft.behaviorCodes" label="积分行为" :columns="behaviors || []" :disabled="disabled || !behaviors?.length" placeholder="全部行为" />
      <wd-picker v-model="draft.earned" label="积分方向" :columns="[{ value: 'ALL', label: '全部' }, { value: 'true', label: '加分' }, { value: 'false', label: '扣分' }]" :disabled="disabled" />
    </template>
    <picker mode="date" :value="draft.startDate" :disabled="disabled" @change="draft.startDate = $event.detail.value"><view class="date-row"><text>开始日期</text><text>{{ draft.startDate || '不限' }}</text></view></picker>
    <picker mode="date" :value="draft.endDate" :disabled="disabled" @change="draft.endDate = $event.detail.value"><view class="date-row"><text>结束日期</text><text>{{ draft.endDate || '不限' }}</text></view></picker>
    <text class="hint">按本机时区筛选，包含开始与结束当天。</text>
    <view class="actions"><wd-button plain size="small" :disabled="disabled" @click="apply(true)">重置</wd-button><wd-button size="small" :disabled="disabled" @click="apply()">筛选</wd-button></view>
    </view>
  </view>
</template>

<style scoped>
.ledger-filters { padding:16rpx; margin-bottom:20rpx; background:#fff; border-radius:var(--yb-radius-lg); }
.date-row { display:flex; justify-content:space-between; gap:16rpx; padding:24rpx 30rpx; font-size:28rpx; }
.hint { display:block; margin:12rpx 24rpx; font-size:22rpx; color:var(--yb-muted); }
.actions { display:flex; justify-content:flex-end; gap:16rpx; margin-top:12rpx; }
</style>
