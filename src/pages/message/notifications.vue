<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { clearNotifications, deleteNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/service/api/notify';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.RealNotify.Notification[]>([]);
const loading = ref(false);
const operating = ref(false);
const unreadCount = computed(() => list.value.filter(item => !item.readFlag).length);

async function load() {
  loading.value = true;
  try {
    list.value = (await fetchNotifications({ pageNo: 1, pageSize: 50 })).records;
  } catch (error) {
    list.value = [];
    uni.showToast({ title: error instanceof Error ? error.message : '通知加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
onShow(load);
function target(notification: Api.RealNotify.Notification): string | undefined {
  const type = notification.bizType || notification.templateCode || '';
  if (type === 'PRODUCT_REVIEW' || /REVIEW/.test(type)) return '/pages/review/list';
  if (/FINANCE|LOCKUP|REDEEM/.test(type)) return '/pages/finance/my-lockups';
  if (/RECHARGE|WITHDRAW|WALLET|FUND/.test(type)) return '/pages/wallet/history';
  if (/KYC/.test(type)) return '/pages/kyc/index';
  if (/BUYER/.test(type)) return '/pages/buyer/apply';
  if (/ORDER|REFUND/.test(type)) return '/pages/order/list';
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
      } finally {
        operating.value = false;
      }
    }
  });
}
</script>

<template>
  <view class="notification-page">
    <view v-if="list.length" class="toolbar">
      <text class="toolbar-text">{{ unreadCount ? `${unreadCount} 条未读` : '全部已读' }}</text>
      <view class="toolbar-actions">
        <text class="action" :class="{ disabled: !unreadCount || operating }" @click="readAll">全部已读</text>
        <text class="action danger" :class="{ disabled: operating }" @click="clear">清空</text>
      </view>
    </view>
    <view v-if="list.length" class="list">
      <view v-for="item in list" :key="item.id" class="item" :class="{ unread: !item.readFlag }" @click="open(item)">
        <view class="dot" />
        <view class="body"><text class="title">{{ item.title || '系统通知' }}</text><text class="content">{{ item.content || '暂无内容' }}</text><text class="time">{{ item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : '' }}</text></view>
        <view class="right"><text class="delete" @click.stop="remove(item)">删除</text><text class="arrow">›</text></view>
      </view>
    </view>
    <EmptyState v-else-if="!loading" title="暂无系统通知" />
  </view>
</template>

<style lang="scss" scoped>
.notification-page { min-height:100%; padding:16rpx; background:#f7f8fa; }.toolbar,.toolbar-actions,.right { display:flex; align-items:center; }.toolbar { justify-content:space-between; padding:8rpx 8rpx 16rpx; }.toolbar-text { color:#86909c; font-size:22rpx; }.toolbar-actions { gap:24rpx; }.action { color:#4d80f0; font-size:24rpx; }.action.danger,.delete { color:#f53f3f; }.disabled { color:#c9cdd4; }.list { background:#fff; border-radius:16rpx; overflow:hidden; }.item { display:flex; align-items:flex-start; padding:24rpx 20rpx; border-bottom:1rpx solid #f2f3f5; gap:14rpx; }.item:last-child { border:none; }.dot { width:12rpx; height:12rpx; margin-top:11rpx; border-radius:50%; background:transparent; flex-shrink:0; }.unread .dot { background:#f53f3f; }.body { flex:1; min-width:0; }.title,.content,.time { display:block; }.title { color:#1d2129; font-size:28rpx; font-weight:600; }.content { color:#4e5969; font-size:24rpx; line-height:1.5; margin-top:6rpx; }.time { color:#86909c; font-size:20rpx; margin-top:8rpx; }.right { flex-shrink:0; flex-direction:column; align-items:flex-end; gap:8rpx; }.delete { font-size:22rpx; }.arrow { color:#c9cdd4; font-size:32rpx; line-height:1; }
</style>
