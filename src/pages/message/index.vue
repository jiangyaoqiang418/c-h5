<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';

interface Category {
  key: string;
  icon: string;
  title: string;
  path: string;
  unread: number;
  latestText: string;
  latestTime: string;
  disabled?: boolean;
}

const categories = ref<Category[]>([]);

function loadMock() {
  categories.value = [
    {
      key: 'system',
      icon: '⚙',
      title: '系统通知',
      path: '',
      unread: 2,
      latestText: 'KYC 审核通过，欢迎解锁全部功能',
      latestTime: '3 小时前'
    },
    {
      key: 'announcement',
      icon: '▰',
      title: '平台公告',
      path: '/pages/announcement/index',
      unread: 1,
      latestText: '5 月大促开启：VIP 加成翻倍 · 新人 100U 到账',
      latestTime: '昨天'
    },
    {
      key: 'txn',
      icon: '▤',
      title: '交易通知',
      path: '',
      unread: 0,
      latestText: '暂无新消息',
      latestTime: '',
      disabled: true
    },
    {
      key: 'im',
      icon: '◌',
      title: '订单群聊',
      path: '/pages/im/order-list',
      unread: 3,
      latestText: '[订单 P-24051201] 买手：已下单，预计 3 日到货',
      latestTime: '15 分钟前'
    }
  ];
}

onShow(loadMock);

const totalUnread = computed(() =>
  categories.value.reduce((s, c) => s + c.unread, 0)
);

function open(c: Category) {
  if (c.disabled) {
    uni.showToast({ title: '功能开发中', icon: 'none' });
    return;
  }
  if (c.path) {
    go(c.path);
  } else {
    uni.showToast({ title: '功能开发中', icon: 'none' });
  }
}
</script>

<template>
  <view class="msg-page">
    <view class="summary" v-if="totalUnread > 0">
      <view>共 <text class="hl">{{ totalUnread }}</text> 条未读消息</view>
    </view>

    <view class="cat-list">
      <view
        v-for="c in categories"
        :key="c.key"
        class="cat-row"
        :class="{ disabled: c.disabled }"
        @click="open(c)"
      >
        <view class="cat-left">
          <view class="cat-icon-wrap">
            <text class="local-icon">{{ c.icon }}</text>
            <view v-if="c.unread > 0" class="unread-dot">{{ c.unread > 99 ? '99+' : c.unread }}</view>
          </view>
        </view>
        <view class="cat-middle">
          <text class="cat-title">{{ c.title }}</text>
          <text class="cat-preview">{{ c.latestText }}</text>
        </view>
        <view class="cat-right">
          <text v-if="c.latestTime" class="cat-time">{{ c.latestTime }}</text>
          <text class="cat-arrow">›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.local-icon { font-size: 34rpx; line-height: 1; }
.msg-page {
  min-height: 100vh;
  background: #FAFAF7;
  padding: 20rpx 24rpx;
}
.summary {
  padding: 20rpx 24rpx;
  font-size: 24rpx;
  color: #86909C;
  .hl {
    color: #F53F3F;
    font-weight: 700;
    font-family: ui-monospace, monospace;
  }
}
.cat-list {
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 20rpx;
  overflow: hidden;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid #EDECE6;
  transition: background 0.15s;
}
.cat-row:last-child { border-bottom: none; }
.cat-row:active { background: #FAFAF7; }
.cat-row.disabled { opacity: 0.5; }

.cat-left {
  flex-shrink: 0;
}
.cat-icon-wrap {
  position: relative;
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #FAFAF7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0F111A;
}
.unread-dot {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 36rpx;
  height: 36rpx;
  border-radius: 18rpx;
  background: #F53F3F;
  color: #FFFFFF;
  font-size: 20rpx;
  font-weight: 700;
  padding: 0 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #FFFFFF;
  box-sizing: border-box;
  line-height: 1;
}
.cat-middle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.cat-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.cat-preview {
  font-size: 22rpx;
  color: #86909C;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380rpx;
}
.cat-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  flex-shrink: 0;
}
.cat-time {
  font-size: 20rpx;
  color: #A8ADB8;
}
.cat-arrow {
  font-size: 32rpx;
  color: #C9CDD4;
  line-height: 1;
}
</style>
