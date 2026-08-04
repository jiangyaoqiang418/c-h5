<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { pointApi as mockPointApi } from '@shared';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import {
  fetchPointLedger,
  submitPointAppeal,
  type PointLedgerView
} from '@/service/api/point';

const userStore = useUserStore();
const activeKey = ref<'log' | 'rule'>('log');
const logs = ref<PointLedgerView[]>([]);
const rules = ref<Api.Point.Rule[]>([]);

const appealPopup = ref(false);
const appealLog = ref<PointLedgerView>();
const appealReason = ref('');

const balance = computed(() => userStore.currentUser?.points ?? logs.value[0]?.balanceAfter ?? 0);

async function load() {
  await userStore.init();
  if (!userStore.currentUser) return;
  try {
    if (activeKey.value === 'log') {
      const r = await fetchPointLedger({ pageNo: 1, pageSize: 50 });
      logs.value = r.records;
    } else if (activeKey.value === 'rule' && !rules.value.length) {
      rules.value = await mockPointApi.fetchPointRules();
    }
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '积分数据加载失败', icon: 'none' });
  }
}
onMounted(load);
watch(activeKey, load);

function openAppeal(l: PointLedgerView) {
  appealLog.value = l;
  appealReason.value = '';
  appealPopup.value = true;
}

async function submitAppeal() {
  if (!appealLog.value) return;
  if (appealReason.value.trim().length < 5) return uni.showToast({ title: '理由 ≥ 5 字', icon: 'none' });
  try {
    await submitPointAppeal({ ledgerId: appealLog.value.id, reason: appealReason.value.trim() });
    uni.showToast({ title: '已提交', icon: 'success' });
    appealPopup.value = false;
    await load();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '提交失败', icon: 'none' });
  }
}

function labelOf(code: string, fallback?: string): string {
  const r = rules.value.find(x => x.code === code);
  return r?.label || fallback || code;
}
</script>

<template>
  <view class="points-page">
    <view class="hero">
      <text class="hero-label">当前积分</text>
      <text class="hero-amount">{{ balance }}</text>
      <text class="hero-hint">完成订单、好评、求购可获得积分</text>
    </view>

    <wd-tabs v-model="activeKey" sticky>
      <wd-tab name="log" title="积分流水" />
      <wd-tab name="rule" title="积分规则" />
    </wd-tabs>

    <view v-if="activeKey === 'log'" class="list">
      <view v-if="logs.length">
        <view v-for="l in logs" :key="l.id" class="log-row">
          <view class="log-main">
            <text class="log-title">{{ labelOf(l.behavior, l.behaviorName) }}</text>
            <text class="log-time">{{ new Date(l.createdAt).toLocaleString() }}</text>
          </view>
          <view class="log-right">
            <text class="log-change" :class="{ pos: l.change > 0, neg: l.change < 0 }">{{ l.change > 0 ? '+' : '' }}{{ l.change }}</text>
            <text v-if="l.isAppealable && l.appealStatus !== 'pending'" class="appeal-btn" @click="openAppeal(l)">申诉</text>
            <text v-else-if="l.appealStatus === 'pending'" class="appeal-tag">申诉中</text>
          </view>
        </view>
      </view>
      <EmptyState v-else title="暂无流水" />
    </view>

    <view v-else class="list">
      <view v-for="r in rules" :key="r.code" class="rule-row">
        <text class="rule-title">{{ r.label }}</text>
        <text class="rule-desc">{{ r.description }}</text>
        <view class="rule-meta">
          <text>每{{ r.unitLabel }} +{{ r.pointsPerUnit }} 分</text>
          <text v-if="r.capDaily > 0">日上限 {{ r.capDaily }}</text>
          <wd-tag v-if="!r.enabled" type="warning" size="small">暂停</wd-tag>
        </view>
      </view>
    </view>

    <wd-popup v-model="appealPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">申诉积分扣减</text>
        <text v-if="appealLog" class="popup-meta">{{ labelOf(appealLog.behavior) }} · {{ appealLog.change }}</text>
        <wd-textarea v-model="appealReason" placeholder="请说明申诉理由（≥ 5 字）" :max-length="200" />
        <wd-button type="primary" block class="popup-btn" @click="submitAppeal">提交申诉</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.points-page { min-height: 100vh; background: #f7f8fa; }
.hero {
  background: linear-gradient(135deg, #ff9a02 0%, #f53f3f 100%);
  color: #fff;
  padding: 48rpx 32rpx;
  text-align: center;
}
.hero-label { display: block; font-size: 22rpx; opacity: 0.8; }
.hero-amount { display: block; font-size: 80rpx; font-weight: 700; font-family: ui-monospace, monospace; margin: 12rpx 0; }
.hero-hint { display: block; font-size: 22rpx; opacity: 0.8; }
.list { padding: 16rpx; }
.log-row {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.log-main { display: flex; flex-direction: column; }
.log-title { font-size: 26rpx; font-weight: 600; }
.log-time { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.log-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; }
.log-change { font-size: 28rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.log-change.pos { color: #00b42a; }
.log-change.neg { color: #f53f3f; }
.appeal-btn { font-size: 22rpx; color: #4d80f0; }
.appeal-tag { font-size: 22rpx; color: #ff9a02; }
.rule-row {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 12rpx;
}
.rule-title { display: block; font-size: 26rpx; font-weight: 600; }
.rule-desc { display: block; font-size: 22rpx; color: #4e5969; margin: 8rpx 0; }
.rule-meta { display: flex; gap: 16rpx; font-size: 22rpx; color: #86909c; align-items: center; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 8rpx; }
.popup-meta { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
</style>
