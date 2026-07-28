<script setup lang="ts">
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';

interface Props {
  group: Api.Im.OrderGroup;
}
const props = defineProps<Props>();

function open() {
  go(`/pages/im/order-group?orderCode=${props.group.orderId}`);
}
</script>

<template>
  <view class="conv-row" @click="open">
    <view class="avatar">{{ group.productTitle.slice(0, 1) }}</view>
    <view class="info">
      <text class="name">{{ group.productTitle }}</text>
      <text class="preview">{{ group.lastMessagePreview || '点击进入聊天' }}</text>
      <text class="meta">U {{ formatAmount(group.orderAmount) }} · 买手 {{ group.shopperName }}</text>
    </view>
    <view class="right">
      <text class="time">{{ new Date(group.lastMessageAt || group.createdAt).toLocaleDateString() }}</text>
      <wd-badge v-if="group.unreadCount > 0" :value="group.unreadCount" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.conv-row {
  display: flex;
  gap: 16rpx;
  padding: 24rpx;
  background: #fff;
  border-bottom: 1rpx solid #f7f8fa;
}
.avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #4d80f0;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 32rpx;
  flex-shrink: 0;
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview {
  display: block;
  font-size: 24rpx;
  color: #86909c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4rpx;
}
.meta {
  display: block;
  font-size: 20rpx;
  color: #c9cdd4;
  margin-top: 4rpx;
}
.right {
  text-align: right;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}
.time {
  font-size: 20rpx;
  color: #86909c;
}
</style>
