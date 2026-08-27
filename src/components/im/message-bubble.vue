<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  msg: Api.Im.Message;
  side: 'left' | 'right' | 'center';
  senderName?: string;
}
const props = defineProps<Props>();

const typeMeta = computed(() => enums.MSG_TYPE_META[props.msg.type]);
const isSystem = computed(() => ['system', 'system-banner'].includes(props.msg.type));
const isRisk = computed(() => ['risk-warning', 'risk-intercept'].includes(props.msg.type));
const isEvent = computed(() =>
  ['order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(
    props.msg.type
  )
);
const isCard = computed(() => ['card-order', 'card-product', 'card-payment'].includes(props.msg.type));
const isMedia = computed(() => ['image', 'video', 'audio', 'file'].includes(props.msg.type));

const eventIcon = computed(() => {
  const m: Record<string, string> = {
    'order-paid': 'wallet',
    'order-shipped': 'cart',
    'order-delivered': 'gift',
    'price-change': 'label',
    'refund-request': 'money-circle',
    'presale-merged': 'link'
  };
  return m[props.msg.type] || 'notification';
});
</script>

<template>
  <view v-if="isSystem" class="msg-row center">
    <view class="bubble system">
      <text>{{ msg.content || typeMeta.label }}</text>
    </view>
  </view>

  <view v-else-if="isEvent" class="msg-row center">
    <view class="bubble event">
      <wd-icon :name="eventIcon" size="24rpx" /><text>{{ typeMeta.label }}：{{ msg.content || '' }}</text>
    </view>
  </view>

  <view v-else-if="isRisk" class="msg-row center">
    <view class="bubble risk" :class="msg.type">
      <wd-icon name="warning" size="24rpx" /><text>{{ typeMeta.label }} — {{ msg.content || '已被平台拦截' }}</text>
    </view>
  </view>

  <view v-else class="msg-row" :class="side">
    <text v-if="side === 'left'" class="sender">{{ senderName || msg.senderName }}</text>

    <view v-if="msg.type === 'text'" class="bubble text" :class="side">
      <text>{{ msg.content }}</text>
    </view>

    <view v-else-if="isCard && msg.cardPayload" class="bubble card" :class="side">
      <image v-if="msg.cardPayload.coverUrl" :src="msg.cardPayload.coverUrl" mode="aspectFill" class="card-cover" />
      <view class="card-body">
        <text class="card-title">{{ msg.cardPayload.title }}</text>
        <text v-if="msg.cardPayload.subtitle" class="card-sub">{{ msg.cardPayload.subtitle }}</text>
        <view v-if="msg.cardPayload.fields?.length" class="fields">
          <view v-for="f in msg.cardPayload.fields" :key="f.label" class="field">
            <text class="f-lbl">{{ f.label }}</text>
            <text class="f-val">{{ f.value }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="isMedia" class="bubble media" :class="side">
      <image v-if="msg.type === 'image' && msg.mediaUrl" :src="msg.mediaUrl" mode="aspectFit" class="media-img" />
      <view v-else class="media-label"><wd-icon name="attachment" size="24rpx" /><text>{{ msg.mediaName || typeMeta.label }}</text></view>
    </view>

    <view v-else class="bubble text" :class="side">
      <text>{{ msg.content || typeMeta.label }}</text>
    </view>

    <text class="time">{{ new Date(msg.sentAt).toLocaleTimeString().slice(0, 5) }}</text>
  </view>
</template>

<style lang="scss" scoped>
.msg-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 20rpx;
}
.msg-row.right { align-items: flex-end; }
.msg-row.center { align-items: center; }
.sender {
  font-size: 20rpx;
  color: #86909c;
  margin-bottom: 4rpx;
  padding: 0 8rpx;
}
.time {
  font-size: 18rpx;
  color: #c9cdd4;
  margin-top: 4rpx;
  padding: 0 8rpx;
}
.bubble {
  max-width: 75%;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  line-height: 1.5;
  word-break: break-word;
}
.bubble.text.left {
  background: #fff;
  color: #1d2129;
  border: 1rpx solid #f2f3f5;
}
.bubble.text.right {
  background: #4d80f0;
  color: #fff;
}
.bubble.system {
  background: #f2f3f5;
  color: #86909c;
  font-size: 22rpx;
  padding: 8rpx 16rpx;
}
.bubble.event {
  display:flex; align-items:center; gap:8rpx;
  background: #fff7e6;
  color: #ff7d00;
  font-size: 22rpx;
  padding: 12rpx 20rpx;
  border: 1rpx solid #ffd591;
}
.bubble.risk {
  display:flex; align-items:center; gap:8rpx;
  font-size: 22rpx;
  padding: 12rpx 20rpx;
}
.bubble.risk.risk-warning {
  background: #fff7e6;
  color: #ff7d00;
  border: 1rpx solid #ffd591;
}
.bubble.risk.risk-intercept {
  background: #ffece8;
  color: #f53f3f;
  border: 1rpx solid #ffadb1;
}
.bubble.card {
  background: #fff;
  border: 1rpx solid #f2f3f5;
  padding: 0;
  overflow: hidden;
  width: 480rpx;
  max-width: 75%;
}
.card-cover {
  width: 100%;
  height: 240rpx;
}
.card-body {
  padding: 16rpx 20rpx;
}
.card-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
}
.card-sub {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.fields {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed #f2f3f5;
}
.field {
  display: flex;
  justify-content: space-between;
  font-size: 22rpx;
  padding: 4rpx 0;
}
.f-lbl { color: #86909c; }
.f-val { color: #1d2129; font-weight: 500; }
.bubble.media {
  padding: 4rpx;
}
.media-label { display:flex; align-items:center; gap:8rpx; padding:12rpx 16rpx; }
.media-img {
  max-width: 400rpx;
  max-height: 400rpx;
  border-radius: 8rpx;
}
</style>
