<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchConversationByOrder, fetchMessages, sendMessage } from '@/service/api/notify';
import { imSocket, type ImSocketState } from '@/service/im-socket';

const userStore = useUserStore();
const conversation = ref<Api.RealNotify.Conversation>();
const messages = ref<Api.RealNotify.Message[]>([]);
const scrollIntoView = ref('');
const inputText = ref('');
const sending = ref(false);
const realtimeState = ref<ImSocketState>('idle');
let unsubscribe: (() => void) | undefined;
let unsubscribeState: (() => void) | undefined;

interface OrderCardContent {
  productTitle?: string;
  orderNo?: string;
  statusText?: string;
  amount?: string | number;
}

function parseOrderCard(content?: string): OrderCardContent | undefined {
  try {
    const parsed = JSON.parse(content || '{}') as OrderCardContent;
    return Object.keys(parsed).length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const latestOrderCard = computed(() => {
  const message = messages.value.find(item => item.msgType === 'ORDER_CARD');
  return message ? parseOrderCard(message.content) : undefined;
});
const headerTitle = computed(() => latestOrderCard.value?.productTitle || conversation.value?.productTitle || conversation.value?.title || '订单群聊');
const headerMeta = computed(() => {
  const orderNo = latestOrderCard.value?.orderNo || conversation.value?.orderNo || conversation.value?.bizId;
  const status = latestOrderCard.value?.statusText || conversation.value?.orderStatusText || '—';
  return `订单 ${orderNo || '—'} · ${status}`;
});

function messageAnchor(id: Api.RealNotify.Id) {
  return `message-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function appendRealtimeMessage(event: unknown) {
  const wrapper = event as { data?: unknown; message?: unknown };
  const candidate = (wrapper?.data || wrapper?.message || event) as Partial<Api.RealNotify.Message>;
  if (!candidate || typeof candidate !== 'object' || String(candidate.conversationId) !== String(conversation.value?.id) || candidate.id == null) return;
  if (messages.value.some(item => String(item.id) === String(candidate.id))) return;
  messages.value.push(candidate as Api.RealNotify.Message);
  nextTick(() => { scrollIntoView.value = messageAnchor(candidate.id!); });
}

async function refreshMessages() {
  if (!conversation.value) return;
  const page = await fetchMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 50 });
  messages.value = [...page.records].reverse();
  await nextTick();
  const last = messages.value.at(-1);
  if (last) scrollIntoView.value = messageAnchor(last.id);
}

function createClientMessageId() {
  return `im-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sendText(content = inputText.value.trim()) {
  if (!conversation.value || sending.value || !content) return;
  const clientMsgId = createClientMessageId();
  const localMessage: Api.RealNotify.Message = {
    id: `local:${clientMsgId}`,
    conversationId: conversation.value.id,
    senderId: userStore.currentUser?.id,
    senderName: '我',
    msgType: 'TEXT',
    content,
    clientMsgId,
    createdAt: String(Date.now()),
    pending: true
  };
  messages.value.push(localMessage);
  inputText.value = '';
  sending.value = true;
  await nextTick();
  scrollIntoView.value = messageAnchor(localMessage.id);
  try {
    await sendMessage({ conversationId: conversation.value.id, msgType: 'TEXT', content, clientMsgId });
    await refreshMessages();
  } catch {
    const pending = messages.value.find(item => item.clientMsgId === clientMsgId);
    if (pending) {
      pending.pending = false;
      pending.failed = true;
    }
  } finally {
    sending.value = false;
  }
}

function retryMessage(message: Api.RealNotify.Message) {
  if (!message.failed || !message.content) return;
  messages.value = messages.value.filter(item => item.id !== message.id);
  sendText(message.content);
}

function retryRealtime() {
  imSocket.restart().catch(() => undefined);
}

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) return;
  try {
    conversation.value = await fetchConversationByOrder(orderId);
    await refreshMessages();
    unsubscribe = imSocket.subscribe(appendRealtimeMessage);
    unsubscribeState = imSocket.subscribeState(state => { realtimeState.value = state; });
    imSocket.start().catch(() => undefined);
    await nextTick();
    const last = messages.value.at(-1);
    if (last) scrollIntoView.value = messageAnchor(last.id);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '订单群加载失败', icon: 'none' });
  }
});

onUnload(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  unsubscribeState?.();
  unsubscribeState = undefined;
  imSocket.stop();
});

function side(message: Api.RealNotify.Message) {
  if (message.msgType === 'SYSTEM' || message.msgType === 'ORDER_CARD') return 'center';
  return String(message.senderId) === String(userStore.currentUser?.id) ? 'right' : 'left';
}

function messageText(message: Api.RealNotify.Message) {
  if (message.recalled) return '消息已撤回';
  if (message.msgType !== 'ORDER_CARD') return message.content || '系统消息';

  try {
    const card = parseOrderCard(message.content) || {};
    const title = card.productTitle || card.orderNo || '订单消息';
    const detail = card.statusText || (card.amount == null ? '' : `金额 ${card.amount} U`);
    return detail ? `${title} · ${detail}` : title;
  } catch {
    return message.content || '订单消息';
  }
}
</script>

<template>
  <view v-if="conversation" class="page">
    <view class="header"><text class="title">{{ headerTitle }}</text><text class="meta">{{ headerMeta }}</text></view>
    <view v-if="realtimeState !== 'ready'" class="realtime-notice">
      <text>{{ realtimeState === 'connecting' ? '正在连接实时服务…' : '实时连接暂不可用，消息仍可发送并在刷新后同步。' }}</text>
      <text v-if="realtimeState === 'unavailable'" class="retry" @click="retryRealtime">重连</text>
    </view>
    <scroll-view scroll-y class="messages" :scroll-into-view="scrollIntoView">
      <view v-for="message in messages" :id="messageAnchor(message.id)" :key="message.id" class="row" :class="side(message)">
        <text v-if="side(message) === 'left'" class="sender">{{ message.senderName || '系统' }}</text>
        <view class="bubble" :class="side(message)"><text>{{ messageText(message) }}</text></view>
        <text v-if="message.pending" class="delivery">发送中</text>
        <text v-else-if="message.failed" class="delivery retry" @click="retryMessage(message)">发送失败，点击重试</text>
      </view>
      <view v-if="!messages.length" class="empty">暂无历史消息</view>
    </scroll-view>
    <view class="composer">
      <input v-model="inputText" class="input" placeholder="输入消息" :disabled="sending" confirm-type="send" @confirm="sendText()" />
      <view class="send" :class="{ disabled: !inputText.trim() || sending }" @click="sendText()">{{ sending ? '发送中' : '发送' }}</view>
    </view>
  </view>
  <EmptyState v-else title="三方群不存在" />
</template>

<style lang="scss" scoped>
.page { height: 100%; display: flex; flex-direction: column; background: #f7f8fa; }
.header { padding: 20rpx 32rpx; background: #fff; border-bottom: 1rpx solid #f2f3f5; }.title,.meta,.sender { display:block; }.title{font-size:30rpx;font-weight:600}.meta,.sender{font-size:22rpx;color:#86909c;margin-top:4rpx}.messages{flex:1;min-height:0;padding:16rpx}.row{display:flex;flex-direction:column;margin-bottom:20rpx}.row.right{align-items:flex-end}.row.center{align-items:center}.bubble{max-width:75%;padding:16rpx 20rpx;border-radius:16rpx;background:#fff;color:#1d2129;font-size:26rpx;word-break:break-word}.bubble.right{background:#4d80f0;color:#fff}.bubble.center{background:#f2f3f5;color:#86909c;font-size:22rpx}.empty{text-align:center;color:#86909c;padding:60rpx 0}
.realtime-notice{display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding:12rpx 32rpx;background:#fff7e6;color:#d46b08;font-size:22rpx}.retry{color:#4d80f0}.delivery{font-size:20rpx;color:#86909c;margin-top:4rpx}.composer{display:flex;align-items:center;gap:12rpx;padding:16rpx 24rpx;padding-bottom:calc(16rpx + env(safe-area-inset-bottom));background:#fff;border-top:1rpx solid #f2f3f5}.input{flex:1;min-width:0;height:64rpx;padding:0 24rpx;box-sizing:border-box;border-radius:32rpx;background:#f7f8fa;font-size:26rpx}.send{padding:16rpx 28rpx;border-radius:32rpx;background:#4d80f0;color:#fff;font-size:26rpx;font-weight:600}.send.disabled{background:#c9cdd4}
</style>
