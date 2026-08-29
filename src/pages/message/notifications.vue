<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { clearNotifications, deleteNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/service/api/notify';
import { go } from '@/utils/navigate';
import { imSocket } from '@/service/im-socket';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const list = ref<Api.RealNotify.Notification[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const operating = ref(false);
const userStore = useUserStore();
const unreadCount = computed(() => list.value.filter(item => !item.readFlag).length);
let unsubscribeRealtime: (() => void) | undefined;
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      list.value = [];
      return;
    }
    list.value = (await fetchNotifications({ pageNo: 1, pageSize: 50 })).records;
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '通知加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
function refreshFromRealtime() {
  if (realtimeRefreshTimer) return;
  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = undefined;
    load();
  }, 80);
}

onShow(async () => {
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      list.value = [];
      return;
    }
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '通知加载失败', icon: 'none' });
    return;
  }
  if (!unsubscribeRealtime) {
    unsubscribeRealtime = imSocket.subscribe(event => {
      if (String((event as { type?: unknown })?.type || '').toUpperCase() === 'NOTIFICATION') {
        refreshFromRealtime();
      }
    });
  }
  imSocket.start().catch(() => undefined);
  load();
});
onUnload(() => {
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = undefined;
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
  imSocket.stop();
});

function target(notification: Api.RealNotify.Notification): string | undefined {
  const id = notification.bizId;
  const template = notification.templateCode || '';
  if (!notification.bizType || id === undefined || id === null || !template) return;
  const knownTemplates: Record<string, string[]> = {
    ORDER: ['order_created', 'order_price_changed', 'order_paid', 'order_shipped', 'order_completed', 'order_settled', 'order_canceled', 'order_refund_applied', 'order_refund_agreed', 'order_refund_rejected', 'order_refund_canceled'],
    PRODUCT_REVIEW: ['review_published'], RECHARGE: ['recharge_confirmed'], WITHDRAW: ['withdraw_submitted', 'withdraw_approved', 'withdraw_success', 'withdraw_rejected'],
    FINANCE: ['finance_subscribed', 'finance_settled', 'finance_redeemed'], KYC: ['kyc_approved', 'kyc_rejected'],
    BUYER_APPLICATION: ['buyer_application_approved', 'buyer_application_rejected'], PURCHASE_DEMAND: ['demand_pushed'], ACCOUNT: ['welcome'], SYSTEM: ['system_notice']
  };
  if (!knownTemplates[notification.bizType]?.includes(template)) return;
  if (notification.bizType === 'ORDER') return `/pages/order/detail?id=${encodeURIComponent(String(id))}`;
  if (notification.bizType === 'PRODUCT_REVIEW') return '/pages/review/list';
  if (notification.bizType === 'RECHARGE') return `/pages/wallet/recharge-detail?id=${encodeURIComponent(String(id))}`;
  if (notification.bizType === 'WITHDRAW') return `/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(id))}`;
  if (notification.bizType === 'FINANCE') return '/pages/finance/my-lockups';
  if (notification.bizType === 'KYC') return '/pages/kyc/index';
  if (notification.bizType === 'BUYER_APPLICATION') return '/pages/buyer/apply';
  if (notification.bizType === 'PURCHASE_DEMAND') return `/pages/purchase/detail?id=${encodeURIComponent(String(id))}`;
  return undefined;
}
async function open(notification: Api.RealNotify.Notification) {
  if (!notification.readFlag) {
    try {
      await markNotificationRead(notification.id);
      notification.readFlag = true;
    } catch {
      // 已读失败不阻断业务通知跳转。
    }
  }
  const path = target(notification);
  if (path) go(path);
}

async function readAll() {
  if (!unreadCount.value || operating.value) return;
  operating.value = true;
  try {
    await markAllNotificationsRead();
    list.value.forEach(item => { item.readFlag = true; });
    uni.showToast({ title: '已全部标记为已读', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '全部已读失败', icon: 'none' });
  } finally {
    operating.value = false;
  }
}

function remove(item: Api.RealNotify.Notification) {
  uni.showModal({
    title: '删除通知？',
    content: '删除后无法恢复。',
    success: async result => {
      if (!result.confirm || operating.value) return;
      operating.value = true;
      try {
        await deleteNotification(item.id);
        list.value = list.value.filter(current => String(current.id) !== String(item.id));
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '通知删除失败', icon: 'none' });
      } finally {
        operating.value = false;
      }
    }
  });
}

function clear() {
  uni.showModal({
    title: '清空全部通知？',
    content: '将删除当前账号的全部站内通知，且无法恢复。',
    confirmText: '确认清空',
    success: async result => {
      if (!result.confirm || operating.value) return;
      operating.value = true;
      try {
        await clearNotifications();
        list.value = [];
        uni.showToast({ title: '已清空', icon: 'success' });
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '通知清空失败', icon: 'none' });
      } finally {
        operating.value = false;
      }
    }
  });
}
</script>

<template>
  <view class="notification-page yb-page">
    <view v-if="list.length" class="toolbar">
      <text class="toolbar-text">{{ unreadCount ? `${unreadCount} 条未读` : '全部已读' }}</text>
      <view class="toolbar-actions">
        <view class="action" :class="{ disabled: !unreadCount || operating }" @click="readAll">全部已读</view>
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
    <EmptyState v-else title="暂无系统通知" />
  </view>
</template>

<style lang="scss" scoped>
.notification-page { min-height:100%; padding:24rpx; }.toolbar,.toolbar-actions,.right { display:flex; align-items:center; }.toolbar { justify-content:space-between; padding:8rpx 0 20rpx 8rpx; }.toolbar-text { color:#86909c; font-size:24rpx; }.toolbar-actions { gap:8rpx; }.action,.delete { display:flex; align-items:center; justify-content:center; min-height:80rpx; padding:0 16rpx; box-sizing:border-box; }.action { color:var(--yb-brand); font-size:24rpx; }.action.danger,.delete { color:var(--yb-danger); }.disabled { color:#c9cdd4; }.list { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); overflow:hidden; }.item { display:flex; align-items:flex-start; padding:24rpx 20rpx; border-bottom:1rpx solid var(--yb-border); gap:14rpx; }.item:last-child { border:none; }.dot { width:12rpx; height:12rpx; margin-top:11rpx; border-radius:50%; background:transparent; flex-shrink:0; }.unread .dot { background:var(--yb-brand); }.body { flex:1; min-width:0; }.title,.content,.time { display:block; }.title { color:#1d2129; font-size:28rpx; font-weight:600; }.content { color:#4e5969; font-size:24rpx; line-height:1.5; margin-top:6rpx; }.time { color:#86909c; font-size:22rpx; margin-top:8rpx; }.right { flex-shrink:0; flex-direction:column; align-items:flex-end; gap:4rpx; }.delete { min-width:80rpx; font-size:24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>
