<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app';
import { clearNotifications, deleteNotification, fetchNotificationUnreadCount, fetchNotifications, isTransactionNotification, markAllNotificationsRead, markNotificationRead } from '@/service/api/notify';
import { usePagedList } from '@/utils/paged-list';
import { getAccessToken, onSessionChanged } from '@/service/request/token';
import { imSocket } from '@/service/im-socket';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const operating = ref(false);
const userStore = useUserStore();
const unreadCount = ref<number>();
const updatesAvailable = ref(false);
const category = ref('all');
const { list: records, loading, loadFailed, hasMore, pageNo, load: loadPage, invalidate, clear: clearPage } = usePagedList<Api.RealNotify.Notification>({
  key: item => item.id,
  preserveOnReset: true,
  fetch: async (pageNo, pageSize) => {
    await userStore.init();
    if (!userStore.currentUser) return { records: [], total: 0 };
    return fetchNotifications({ pageNo, pageSize });
  }
});
const list = computed(() => records.value.filter(item => category.value === 'all' || isTransactionNotification(item) === (category.value === 'transaction')));
let unsubscribeRealtime: (() => void) | undefined;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let visible = false;
let pageVersion = 0;
let operationSequence = 0;
let countSequence = 0;
let countTask: Promise<void> | undefined;
let countRequested = false;
let updateVersion = 0;
let retryReset = true;
const unsubscribeSession = onSessionChanged(() => {
  pageVersion++;
  operationSequence++;
  countSequence++;
  unreadCount.value = undefined;
  updatesAvailable.value = false;
  operating.value = false;
  countRequested = false;
  retryReset = true;
});

function currentPage() {
  const version = pageVersion;
  const token = getAccessToken();
  const userId = userStore.realUserId;
  return () => visible && version === pageVersion && !!token && token === getAccessToken() && !!userId && userId === userStore.realUserId;
}

async function refreshUnread() {
  if (!visible || !userStore.realUserId) return;
  if (operating.value || countTask) { countRequested = true; return; }
  const valid = currentPage();
  const sequence = ++countSequence;
  countRequested = false;
  const task = (async () => {
    try {
      const count = await fetchNotificationUnreadCount();
      if (!Number.isSafeInteger(Number(count)) || count == null || Number(count) < 0) throw new Error('未读数无效');
      if (valid() && sequence === countSequence) unreadCount.value = Number(count);
    } catch {
      if (valid() && sequence === countSequence) unreadCount.value = undefined;
    }
  })();
  countTask = task;
  await task;
  if (countTask === task) {
    countTask = undefined;
    if (countRequested && visible && !operating.value) void refreshUnread();
  }
}

function beginOperation() {
  const valid = currentPage();
  if (!valid() || operating.value || loading.value) return;
  operating.value = true;
  countSequence++;
  const sequence = ++operationSequence;
  return {
    valid,
    finish() {
      if (sequence !== operationSequence) return;
      operating.value = false;
      if (valid()) void refreshUnread();
    }
  };
}
onLoad(query => {
  category.value = query?.category === 'system' || query?.category === 'transaction' ? query.category : 'all';
  uni.setNavigationBarTitle({ title: category.value === 'transaction' ? '交易通知' : category.value === 'system' ? '系统通知' : '全部通知' });
});

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load(reset = true) {
  if (!visible || operating.value || loading.value) return;
  const page = pageVersion;
  const token = getAccessToken();
  try { await userStore.init(); } catch {
    if (visible && page === pageVersion && token === getAccessToken()) loadFailed.value = true;
    return;
  }
  if (!visible || page !== pageVersion || token !== getAccessToken() || operating.value || loading.value) return;
  if (!userStore.realUserId) { loadFailed.value = !!getAccessToken(); return; }
  if (!unsubscribeRealtime) ensureRealtime();
  const valid = currentPage();
  const version = updateVersion;
  retryReset = reset;
  if (!(await loadPage(reset))) return;
  if (!valid()) return;
  if (reset && version === updateVersion) updatesAvailable.value = false;
  while (valid() && !list.value.length && hasMore.value && !loadFailed.value && !loading.value) {
    retryReset = false;
    if (!(await loadPage(false))) return;
  }
  if (valid()) void refreshUnread();
}
function loadMore() { return load(loadFailed.value ? retryReset : false); }
onReachBottom(loadMore);
function refreshFromRealtime() {
  updateVersion++;
  updatesAvailable.value = true;
  countSequence++;
  if (!visible || realtimeRefreshTimer) return;
  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = undefined;
    void refreshUnread();
  }, 80);
}

function ensureRealtime() {
  if (!unsubscribeRealtime) {
    unsubscribeRealtime = imSocket.subscribe(event => {
      if (String((event as { type?: unknown })?.type || '').toUpperCase() === 'NOTIFICATION') refreshFromRealtime();
    });
  }
  imSocket.start().catch(() => undefined);
}

onShow(async () => {
  visible = true;
  const version = ++pageVersion;
  const token = getAccessToken();
  try {
    await userStore.init();
    if (!visible || version !== pageVersion || token !== getAccessToken()) return;
    if (!userStore.currentUser) {
      clearPage();
      loadFailed.value = !!token;
      unreadCount.value = undefined;
      return;
    }
  } catch (error) {
    if (!visible || version !== pageVersion || token !== getAccessToken()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '通知加载失败', icon: 'none' });
    return;
  }
  ensureRealtime();
  if (pageNo.value === 0) void load();
  else void refreshUnread();
});
function leavePage() {
  if (operating.value) updatesAvailable.value = true;
  visible = false;
  pageVersion++;
  operationSequence++;
  countSequence++;
  operating.value = false;
  countRequested = false;
  invalidate();
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = undefined;
}
onHide(leavePage);
onUnload(() => {
  leavePage();
  unsubscribeSession();
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
  imSocket.stopIfUnused();
});

function target(notification: Api.RealNotify.Notification): string | undefined {
  const id = notification.bizId;
  const type = notification.bizType?.toUpperCase();
  if (type === 'PRODUCT_REVIEW') return '/pages/review/list';
  if (type === 'FINANCE') return '/pages/finance/my-lockups';
  if (type === 'KYC') return '/pages/kyc/index';
  if (type === 'BUYER_APPLICATION') return '/pages/buyer/apply';
  if (id === undefined || id === null || id === '') return;
  if (type === 'ORDER') return `/pages/order/detail?id=${encodeURIComponent(String(id))}`;
  if (type === 'RECHARGE') return `/pages/wallet/recharge-detail?id=${encodeURIComponent(String(id))}`;
  if (type === 'WITHDRAW') return `/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(id))}`;
  if (type === 'PURCHASE_DEMAND') return `/pages/purchase/detail?id=${encodeURIComponent(String(id))}`;
  return undefined;
}
async function open(notification: Api.RealNotify.Notification) {
  if (!records.value.some(item => String(item.id) === String(notification.id))) return;
  const operation = beginOperation();
  if (!operation) return;
  try {
    if (!notification.readFlag) {
      try {
        const version = updateVersion;
        if (!(await markNotificationRead(notification.id))) throw new Error('通知未读状态未更新');
        if (!operation.valid()) return;
        const wasUnread = records.value.some(item => String(item.id) === String(notification.id) && !item.readFlag);
        records.value = records.value.map(item => String(item.id) === String(notification.id) ? { ...item, readFlag: true } : item);
        if (version !== updateVersion) unreadCount.value = undefined;
        else if (wasUnread && unreadCount.value !== undefined) unreadCount.value = Math.max(0, unreadCount.value - 1);
      } catch {
        // 已读失败不阻断业务通知跳转，但旧页面不得继续导航。
      }
    }
    const path = target(notification);
    if (operation.valid() && path) await uni.navigateTo({ url: path });
  } catch {
    if (operation.valid()) uni.showToast({ title: '业务页面打开失败，请重试', icon: 'none' });
  } finally {
    operation.finish();
  }
}

async function readAll() {
  if (unreadCount.value === 0) return;
  const operation = beginOperation();
  if (!operation) return;
  const version = updateVersion;
  try {
    if (!(await markAllNotificationsRead())) throw new Error('全部已读未完成，请重试');
    if (!operation.valid()) return;
    records.value = records.value.map(item => ({ ...item, readFlag: true }));
    unreadCount.value = version === updateVersion ? 0 : undefined;
    uni.showToast({ title: '已全部标记为已读', icon: 'success' });
  } catch (error) {
    if (!operation.valid()) return;
    uni.showToast({ title: error instanceof Error ? error.message : '全部已读失败', icon: 'none' });
  } finally {
    operation.finish();
  }
}

async function remove(item: Api.RealNotify.Notification) {
  if (!records.value.some(current => String(current.id) === String(item.id))) return;
  const operation = beginOperation();
  if (!operation) return;
  let refresh = false;
  try {
    const result = await uni.showModal({ title: '删除通知？', content: '删除后无法恢复。' });
    if (!result.confirm || !operation.valid()) return;
    if (!(await deleteNotification(item.id))) throw new Error('通知未删除，请刷新核对');
    if (!operation.valid()) return;
    records.value = records.value.filter(current => String(current.id) !== String(item.id));
    updatesAvailable.value = true;
    refresh = true;
    uni.showToast({ title: '已删除', icon: 'success' });
  } catch (error) {
    if (operation.valid()) uni.showToast({ title: error instanceof Error ? error.message : '通知删除失败', icon: 'none' });
  } finally {
    operation.finish();
    if (refresh && operation.valid()) await load();
  }
}

async function clear() {
  const operation = beginOperation();
  if (!operation) return;
  let refresh = false;
  try {
    const result = await uni.showModal({ title: '清空全部通知？', content: '将删除当前账号的全部站内通知，且无法恢复。', confirmText: '确认清空' });
    if (!result.confirm || !operation.valid()) return;
    const version = updateVersion;
    if (!(await clearNotifications())) throw new Error('通知未清空，请刷新核对');
    if (!operation.valid()) return;
    clearPage();
    unreadCount.value = version === updateVersion ? 0 : undefined;
    updatesAvailable.value = true;
    refresh = true;
    uni.showToast({ title: '已清空', icon: 'success' });
  } catch (error) {
    if (operation.valid()) uni.showToast({ title: error instanceof Error ? error.message : '通知清空失败', icon: 'none' });
  } finally {
    operation.finish();
    if (refresh && operation.valid()) await load();
  }
}
</script>

<template>
  <view class="notification-page yb-page">
    <wd-button v-if="userStore.currentUser" block plain :loading="loading" :disabled="operating" @click="load(true)">{{ updatesAvailable ? '通知有更新，点击刷新' : '刷新通知' }}</wd-button>
    <view v-if="records.length || unreadCount" class="toolbar">
      <text class="toolbar-text">{{ unreadCount === undefined ? '未读数暂不可用' : `账号共 ${unreadCount} 条未读` }}</text>
      <view class="toolbar-actions">
        <view class="action" :class="{ disabled: unreadCount === 0 || operating }" @click="readAll">全部通知已读</view>
        <view class="action danger" :class="{ disabled: operating }" @click="clear">清空</view>
      </view>
    </view>
    <view v-if="list.length" class="list">
      <view v-for="item in list" :key="item.id" class="item" :class="{ unread: !item.readFlag }" @click="open(item)">
        <view class="dot" />
        <view class="body"><text class="title">{{ item.title || '系统通知' }}</text><text class="content">{{ item.content || '暂无内容' }}</text><text class="time">{{ formatTime(item.createdAt) }}</text></view>
        <view class="right"><view class="delete" @click.stop="remove(item)">删除</view><wd-icon name="arrow-right" size="16px" color="#a6a9b1" /></view>
      </view>
    </view>
    <EmptyState v-else-if="loadFailed" title="通知加载失败" description="请稍后重试" />
    <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载通知</text></view>
    <EmptyState v-else :title="!userStore.currentUser ? '请先登录查看通知' : hasMore ? '已加载记录中暂无此类通知' : '暂无此类通知'" />
    <wd-button v-if="(userStore.currentUser || loadFailed) && (hasMore || loadFailed)" block plain :loading="loading" :disabled="operating" @click="loadMore">{{ loadFailed ? '加载失败，点击重试' : '加载更多' }}</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.notification-page { min-height:100%; padding:24rpx; }.toolbar,.toolbar-actions,.right { display:flex; align-items:center; }.toolbar { justify-content:space-between; padding:8rpx 0 20rpx 8rpx; }.toolbar-text { color:#86909c; font-size:24rpx; }.toolbar-actions { gap:8rpx; }.action,.delete { display:flex; align-items:center; justify-content:center; min-height:80rpx; padding:0 16rpx; box-sizing:border-box; }.action { color:var(--yb-brand); font-size:24rpx; }.action.danger,.delete { color:var(--yb-danger); }.disabled { color:#c9cdd4; }.list { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); overflow:hidden; }.item { display:flex; align-items:flex-start; padding:24rpx 20rpx; border-bottom:1rpx solid var(--yb-border); gap:14rpx; }.item:last-child { border:none; }.dot { width:12rpx; height:12rpx; margin-top:11rpx; border-radius:50%; background:transparent; flex-shrink:0; }.unread .dot { background:var(--yb-brand); }.body { flex:1; min-width:0; }.title,.content,.time { display:block; }.title { color:#1d2129; font-size:28rpx; font-weight:600; }.content { color:#4e5969; font-size:24rpx; line-height:1.5; margin-top:6rpx; }.time { color:#86909c; font-size:22rpx; margin-top:8rpx; }.right { flex-shrink:0; flex-direction:column; align-items:flex-end; gap:4rpx; }.delete { min-width:80rpx; font-size:24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>
