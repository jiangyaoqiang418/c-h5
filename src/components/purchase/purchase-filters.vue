<script setup lang="ts">
import { reactive, ref } from 'vue';

const props = defineProps<{ disabled?: boolean }>();
type Filters = Pick<Api.RealPurchase.PurchaseDemandPageQuery, 'minBudget' | 'maxBudget' | 'minDeliveryDays' | 'maxDeliveryDays'>;
const emit = defineEmits<{ (event: 'apply', value: Filters): void }>();
const expanded = ref(false);
const applied = ref(false);
const draft = reactive({ minBudget: '', maxBudget: '', minDeliveryDays: '', maxDeliveryDays: '' });
function apply(reset = false) {
  if (props.disabled) return;
  if (reset) Object.assign(draft, { minBudget: '', maxBudget: '', minDeliveryDays: '', maxDeliveryDays: '' });
  try {
    const value: Filters = {};
    for (const key of Object.keys(draft) as Array<keyof Filters>) {
      const input = draft[key].trim();
      if (!input) continue;
      if (!/^\d+(\.\d+)?$/.test(input) || !Number.isFinite(Number(input))) throw new Error('请输入有效的非负预算或天数');
      const parsed = Number(input);
      if (key.endsWith('Days') && (!Number.isSafeInteger(parsed) || parsed > 2147483647)) throw new Error('交付天数须为有效整数');
      value[key] = parsed;
    }
    if ((value.minBudget != null && value.maxBudget != null && value.minBudget > value.maxBudget)
      || (value.minDeliveryDays != null && value.maxDeliveryDays != null && value.minDeliveryDays > value.maxDeliveryDays)) throw new Error('下限不能超过上限');
    emit('apply', value);
    applied.value = Object.keys(value).length > 0;
    expanded.value = false;
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '筛选条件无效', icon: 'none' }); }
}
</script>

<template>
  <view class="filters">
    <wd-button plain size="small" :disabled="disabled" @click="expanded = !expanded">{{ expanded ? '收起筛选' : applied ? '筛选 · 已生效' : '筛选' }}</wd-button>
    <view v-show="expanded">
    <view class="fields">
      <wd-input v-model="draft.minBudget" :disabled="disabled" label="最低预算 U" placeholder="不限" type="digit" />
      <wd-input v-model="draft.maxBudget" :disabled="disabled" label="最高预算 U" placeholder="不限" type="digit" />
      <wd-input v-model="draft.minDeliveryDays" :disabled="disabled" label="最少交付天数" placeholder="不限" type="number" />
      <wd-input v-model="draft.maxDeliveryDays" :disabled="disabled" label="最多交付天数" placeholder="不限" type="number" />
    </view>
    <view class="actions"><wd-button plain size="small" :disabled="disabled" @click="apply(true)">重置</wd-button><wd-button size="small" :disabled="disabled" @click="apply()">筛选</wd-button></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.filters { padding:16rpx; margin-bottom:20rpx; background:#fff; border-radius:var(--yb-radius-lg); }
.fields { display:flex; flex-direction:column; }
.actions { display:flex; justify-content:flex-end; gap:16rpx; margin-top:12rpx; }
</style>
