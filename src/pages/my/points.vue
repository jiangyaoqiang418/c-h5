<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onHide, onReachBottom, onShow } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';
import { usePageOperation } from '@/utils/page-operation';
import {
  fetchPointAppeals,
  fetchPointLedger,
  fetchPointRules,
  submitPointAppeal,
  type PointAppealView,
  type PointLedgerView
} from '@/service/api/point';

const userStore = useUserStore();
const activeKey = ref<'log' | 'appeal' | 'rule'>('log');
const logs = ref<PointLedgerView[]>([]);
const appeals = ref<PointAppealView[]>([]);
const rules = ref<import('@/service/api/point').PointRuleView[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const logPageNo = ref(1);
const logTotal = ref(0);
const appealPageNo = ref(1);
const appealTotal = ref(0);
const pageSize = 50;
let loadToken = 0;

const appealPopup = ref(false);
const appealLog = ref<PointLedgerView>();
const appealReason = ref('');
const submitting = ref(false);
const pendingAppeals = ref<Record<string, string>>({});
let appealOperation: ReturnType<ReturnType<typeof usePageOperation>['capture']> | undefined;
const page = usePageOperation(() => {
  loadToken++;
  logs.value = [];
  appeals.value = [];
  logPageNo.value = 1;
  appealPageNo.value = 1;
  logTotal.value = 0;
  appealTotal.value = 0;
  loading.value = false;
  loadFailed.value = false;
  appealPopup.value = false;
  appealLog.value = undefined;
  appealReason.value = '';
  appealOperation = undefined;
  submitting.value = false;
  pendingAppeals.value = {};
});
onHide(() => { appealPopup.value = false; appealOperation = undefined; });

const balance = computed(() => userStore.currentUser?.points ?? logs.value[0]?.balanceAfter ?? '—');

async function load(reset = true) {
  if (!page.visible.value || (loading.value && !reset)) return;
  if (reset) loadFailed.value = false;
  const tab = activeKey.value;
  const token = ++loadToken;
  const operation = page.capture();
  const valid = () => operation.isCurrent() && token === loadToken;
  loading.value = true;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser && tab !== 'rule') return;
    if (tab === 'log') {
      const targetPage = reset ? 1 : logPageNo.value + 1;
      const r = await fetchPointLedger({ pageNo: targetPage, pageSize });
      if (!valid()) return;
      logs.value = reset ? r.records : logs.value.concat(r.records);
      logPageNo.value = r.current || targetPage;
      logTotal.value = r.total;
    } else if (tab === 'appeal') {
      const targetPage = reset ? 1 : appealPageNo.value + 1;
      const r = await fetchPointAppeals({
        pageNo: targetPage,
        pageSize,
        userId: userStore.realUserId
      });
      if (!valid()) return;
      appeals.value = reset ? r.records : appeals.value.concat(r.records);
      for (const record of r.records) {
        if (record.status === 'PENDING') continue;
        for (const [ledgerId, appealId] of Object.entries(pendingAppeals.value)) {
          if (appealId === String(record.id)) delete pendingAppeals.value[ledgerId];
        }
      }
      appealPageNo.value = r.current || targetPage;
      appealTotal.value = r.total;
    } else if (!rules.value.length) {
      const result = await fetchPointRules();
      if (valid()) rules.value = result;
    }
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = tab === 'log' ? !logs.value.length : tab === 'appeal' ? !appeals.value.length : !rules.value.length;
    uni.showToast({ title: error instanceof Error ? error.message : '积分数据加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && token === loadToken) loading.value = false;
  }
}
onShow(async () => {
  const operation = page.capture();
  try { await userStore.refreshProfile(); } catch { /* 仍读取流水；失败不改写已有资料。 */ }
  if (operation.isCurrent()) await load();
});
watch(activeKey, () => load());
onReachBottom(() => {
  if (activeKey.value === 'log' && logs.value.length < logTotal.value) load(false);
  if (activeKey.value === 'appeal' && appeals.value.length < appealTotal.value) load(false);
});

function openAppeal(l: PointLedgerView) {
  if (!page.visible.value || !userStore.currentUser || submitting.value || loading.value || loadFailed.value || !l.isAppealable || l.appealStatus === 'pending' || pendingAppeals.value[l.id] || !logs.value.includes(l)) return;
  appealOperation = page.capture();
  appealLog.value = l;
  appealReason.value = '';
  appealPopup.value = true;
}
function viewAppeals() {
  if (activeKey.value === 'appeal') void load();
  else activeKey.value = 'appeal';
}

async function submitAppeal() {
  const operation = appealOperation;
  if (!operation?.isCurrent() || !userStore.currentUser || !appealPopup.value || submitting.value || !appealLog.value || pendingAppeals.value[appealLog.value.id]) return;
  if (appealReason.value.trim().length < 5) return uni.showToast({ title: '理由 ≥ 5 字', icon: 'none' });
  const request = { ledgerId: appealLog.value.id, reason: appealReason.value.trim() };
  submitting.value = true;
  try {
    const id = await submitPointAppeal(request);
    if (!operation.sameSession()) return;
    pendingAppeals.value[request.ledgerId] = String(id);
    appealPopup.value = false;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: '已提交', icon: 'success' });
    await load();
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) submitting.value = false;
  }
}

function labelOf(code: string, fallback?: string): string {
  const r = rules.value.find(x => x.code === code);
  return r?.label || fallback || code;
}

function appealStatusText(status: Api.Point.RealAppealStatus): string {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[status];
}

function formatDate(value?: string | number): string {
  if (!value) return '-';
  const timestamp = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
</script>

<template>
  <view class="points-page yb-page yb-page--full-bleed">
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.points})` }">
      <text class="hero-label">当前积分</text>
      <text class="hero-amount">{{ balance }}</text>
      <text class="hero-hint">完成订单、好评、求购可获得积分</text>
    </view>

    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab name="log" title="积分流水" />
        <wd-tab name="appeal" title="申诉记录" />
        <wd-tab name="rule" title="积分规则" />
      </wd-tabs>
    </view>

    <wd-button v-if="Object.keys(pendingAppeals).length" block plain @click="viewAppeals">申诉已提交，查看记录</wd-button>
    <EmptyState v-if="loadFailed" title="积分数据加载失败" description="请重新加载后继续" action-text="重新加载" @action="load()" />

    <view v-else-if="activeKey === 'log'" class="list">
      <view v-if="logs.length">
        <view v-for="l in logs" :key="l.id" class="log-row">
          <view class="log-main">
            <text class="log-title">{{ labelOf(l.behavior, l.behaviorName) }}</text>
            <text class="log-time">{{ formatDate(l.createdAt) }}</text>
          </view>
          <view class="log-right">
            <text class="log-change" :class="{ pos: l.change > 0, neg: l.change < 0 }">{{ l.change > 0 ? '+' : '' }}{{ l.change }}</text>
            <text v-if="l.isAppealable && l.appealStatus !== 'pending' && !pendingAppeals[l.id]" class="appeal-btn yb-pressable" @click="openAppeal(l)">申诉</text>
            <text v-else-if="l.appealStatus === 'pending' || pendingAppeals[l.id]" class="appeal-tag yb-status-pill">申诉中</text>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loading" title="暂无流水" />
    </view>

    <view v-else-if="activeKey === 'appeal'" class="list">
      <view v-if="appeals.length">
        <view v-for="item in appeals" :key="item.id" class="appeal-row">
          <view class="appeal-head">
            <text class="appeal-title">{{ item.behaviorName }}</text>
            <text class="appeal-status yb-status-pill" :class="`status-${item.status.toLowerCase()}`">
              {{ appealStatusText(item.status) }}
            </text>
          </view>
          <text class="appeal-score">原积分变动 {{ item.originalScore > 0 ? '+' : '' }}{{ item.originalScore }}</text>
          <text class="appeal-reason">{{ item.reason }}</text>
          <text v-if="item.reviewComment" class="appeal-review">审核意见：{{ item.reviewComment }}</text>
          <view class="appeal-times">
            <text>提交 {{ formatDate(item.createdAt) }}</text>
            <text v-if="item.reviewedAt">审核 {{ formatDate(item.reviewedAt) }}</text>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loading" title="暂无申诉记录" />
    </view>

    <view v-else class="list">
      <view v-for="r in rules" :key="r.code" class="rule-row">
        <text class="rule-title">{{ r.label }}</text>
        <text class="rule-desc">{{ r.description }}</text>
        <view class="rule-meta">
          <text>每{{ r.unitLabel }} +{{ r.pointsPerUnit }} 分</text>
          <text v-if="Number(r.capDaily) > 0">日上限 {{ r.capDaily }}</text>
          <wd-tag v-if="!r.enabled" type="warning" size="small" round>暂停</wd-tag>
        </view>
      </view>
    </view>

    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载积分数据</text></view>

    <wd-popup v-model="appealPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">申诉积分扣减</text>
        <text v-if="appealLog" class="popup-meta">{{ labelOf(appealLog.behavior) }} · {{ appealLog.change }}</text>
        <wd-textarea v-model="appealReason" placeholder="请说明申诉理由（≥ 5 字）" :max-length="200" />
        <wd-button type="primary" block class="popup-btn" :loading="submitting" :disabled="submitting" @click="submitAppeal">提交申诉</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.points-page { min-height: 100%; }
.hero {
  background-color: #2a175d;
  background-size: cover;
  background-position: center;
  color: #fff;
  padding: 48rpx 32rpx;
  text-align: center;
}
.hero-label { display: block; font-size: 22rpx; opacity: 0.8; }
.hero-amount { display: block; font-size: 80rpx; font-weight: 700; font-family: ui-monospace, monospace; margin: 12rpx 0; }
.hero-hint { display: block; font-size: 22rpx; opacity: 0.8; }
.list { padding: 24rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:#86909c; font-size:24rpx; }
.log-row {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 16rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
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
.appeal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48rpx;
  padding: 0 18rpx;
  border: 1rpx solid rgba(250, 36, 60, 0.28);
  border-radius: var(--yb-radius-pill);
  font-size: 22rpx;
  color: var(--yb-brand);
}
.appeal-tag { color: #a76f22; background: var(--yb-warning-soft); }
.appeal-row {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 16rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
}
.appeal-head { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; }
.appeal-title { font-size: 26rpx; font-weight: 600; }
.appeal-status { flex-shrink: 0; }
.status-pending { color: #a76f22; background: var(--yb-warning-soft); }
.status-approved { color: var(--yb-success); background: var(--yb-success-soft); }
.status-rejected { color: var(--yb-danger); background: var(--yb-danger-soft); }
.appeal-score { display: block; margin-top: 8rpx; font-size: 22rpx; color: #86909c; }
.appeal-reason { display: block; margin-top: 12rpx; font-size: 24rpx; color: #4e5969; line-height: 1.6; }
.appeal-review {
  display: block;
  margin-top: 12rpx;
  padding: 16rpx;
  border-radius: 8rpx;
  background: #f7f8fa;
  font-size: 22rpx;
  color: #4e5969;
  line-height: 1.5;
}
.appeal-times { display: flex; flex-direction: column; gap: 4rpx; margin-top: 12rpx; font-size: 20rpx; color: #86909c; }
.rule-row {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 16rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
}
.rule-title { display: block; font-size: 26rpx; font-weight: 600; }
.rule-desc { display: block; font-size: 22rpx; color: #4e5969; margin: 8rpx 0; }
.rule-meta { display: flex; gap: 16rpx; font-size: 22rpx; color: #86909c; align-items: center; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 8rpx; }
.popup-meta { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
</style>
