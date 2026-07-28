<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { imApi } from '@shared';
import { findUserById } from '@shared/mock/data/users';
import MessageBubble from '@/components/im/message-bubble.vue';
import MessageInput from '@/components/im/message-input.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const group = ref<Api.Im.OrderGroup>();
const messages = ref<Api.Im.Message[]>([]);
const scrollIntoView = ref('');

onLoad(async query => {
  const orderCode = String(query?.orderCode || '');
  if (!orderCode) return;
  const g = await imApi.fetchOrderGroupByOrderCode(orderCode);
  if (g) {
    group.value = g;
    messages.value = await imApi.fetchMessages(g.id);
    await nextTick();
    scrollToBottom();
  }
});

function scrollToBottom() {
  const last = messages.value[messages.value.length - 1];
  if (last) scrollIntoView.value = `msg-${last.id}`;
}

const sideOf = (msg: Api.Im.Message): 'left' | 'right' | 'center' => {
  if (['system', 'system-banner', 'risk-warning', 'risk-intercept', 'order-paid', 'order-shipped', 'order-delivered', 'price-change', 'refund-request', 'presale-merged'].includes(msg.type)) return 'center';
  return msg.senderId === userStore.currentUser?.id ? 'right' : 'left';
};

const riskCount = computed(() => messages.value.filter(m => m.type === 'risk-warning' || m.type === 'risk-intercept').length);

const disabled = computed(() => {
  if (!group.value) return true;
  return ['ARCHIVED', 'DISSOLVED', 'ARCHIVING'].includes(group.value.orderGroupStatus);
});

const disabledText = computed(() => {
  if (!group.value) return '';
  if (group.value.orderGroupStatus === 'ARCHIVED') return '本群已归档，仅可查看历史消息';
  if (group.value.orderGroupStatus === 'DISSOLVED') return '本群已解散';
  if (group.value.orderGroupStatus === 'ARCHIVING') return '本群归档中';
  return '';
});

async function onSend(payload: { type: Api.Im.MessageType; content?: string; mediaUrl?: string }) {
  if (!group.value || !userStore.currentUser) return;
  const newMsg = await imApi.sendMessageMock({
    conversationId: group.value.id,
    senderId: userStore.currentUser.id,
    type: payload.type,
    content: payload.content,
    mediaUrl: payload.mediaUrl
  });
  messages.value.push(newMsg);
  await nextTick();
  scrollToBottom();

  if (userStore.currentUser.id === group.value.customerId && payload.type === 'text') {
    setTimeout(async () => {
      if (!group.value) return;
      const shopperUser = findUserById(group.value.shopperId);
      const replyTexts = ['好的，我看下', '收到，稍后回复', '我这边核实一下', '没问题，按您要求处理'];
      const reply = replyTexts[messages.value.length % replyTexts.length];
      const r = await imApi.sendMessageMock({
        conversationId: group.value.id,
        senderId: group.value.shopperId,
        type: 'text',
        content: reply
      });
      r.senderRole = 'shopper';
      r.senderName = shopperUser?.nickname || '买手';
      messages.value.push(r);
      await nextTick();
      scrollToBottom();
    }, 1500);
  }
}

function getSenderName(msg: Api.Im.Message): string {
  if (msg.senderId === userStore.currentUser?.id) return '我';
  const u = findUserById(msg.senderId);
  return u?.nickname || msg.senderName || '系统';
}
</script>

<template>
  <view v-if="group" class="im-page">
    <view class="header">
      <text class="title">{{ group.productTitle }}</text>
      <text class="meta">订单 {{ group.orderId }} · 状态 {{ group.orderGroupStatus }}</text>
    </view>
    <view v-if="riskCount > 0" class="risk-banner">⚠️ 本群已触发 {{ riskCount }} 次风控提示</view>

    <scroll-view scroll-y class="messages" :scroll-into-view="scrollIntoView" :scroll-with-animation="true">
      <view v-for="m in messages" :id="`msg-${m.id}`" :key="m.id">
        <MessageBubble :msg="m" :side="sideOf(m)" :sender-name="getSenderName(m)" />
      </view>
      <view v-if="!messages.length" class="empty-msg">该群暂无消息，开始聊天吧 👋</view>
    </scroll-view>

    <MessageInput :disabled="disabled" :disabled-text="disabledText" @send="onSend" />
  </view>
  <EmptyState v-else title="三方群不存在" />
</template>

<style lang="scss" scoped>
.im-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7f8fa;
}
.header {
  background: #fff;
  padding: 20rpx 32rpx;
  border-bottom: 1rpx solid #f2f3f5;
}
.title { display: block; font-size: 30rpx; font-weight: 600; }
.meta { display: block; font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.risk-banner {
  background: #fff7e6;
  color: #ff7d00;
  padding: 14rpx 32rpx;
  font-size: 24rpx;
  border-bottom: 1rpx solid #ffe7ba;
}
.messages {
  flex: 1;
  padding: 16rpx;
}
.empty-msg {
  text-align: center;
  color: #86909c;
  padding: 60rpx 0;
  font-size: 24rpx;
}
</style>
