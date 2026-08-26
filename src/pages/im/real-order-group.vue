<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchConversationByOrder, fetchMessages, markImMessagesRead, recallImMessage, sendMessage, uploadImImage, uploadImVoice } from '@/service/api/notify';
import { fetchOrderDetail } from '@/service/api/order';
import { imSocket, type ImSocketState } from '@/service/im-socket';

const userStore = useUserStore();
const conversation = ref<Api.RealNotify.Conversation>();
const messages = ref<Api.RealNotify.Message[]>([]);
const scrollIntoView = ref('');
const inputText = ref('');
const sending = ref(false);
const realtimeState = ref<ImSocketState>('idle');
const currentOrderStatus = ref('');
const voiceRecording = ref(false);
const playingVoiceId = ref<string>();
const readerWatermarks = ref<Record<string, Api.RealNotify.Id>>({});
let currentOrderId = '';
let unsubscribe: (() => void) | undefined;
let unsubscribeState: (() => void) | undefined;
let recorder: ReturnType<typeof uni.getRecorderManager> | undefined;
let recorderBound = false;
let voicePlayer: ReturnType<typeof uni.createInnerAudioContext> | undefined;

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
  const status = currentOrderStatus.value || latestOrderCard.value?.statusText || conversation.value?.orderStatusText || '—';
  return `订单 ${orderNo || '—'} · ${status}`;
});

const orderStatusText: Partial<Record<Api.Order.OrderStatus, string>> = {
  PENDING_PAYMENT: '待付款',
  PROCURING: '采购中',
  IN_TRANSIT: '运输中',
  IN_AFTERSALE: '售后处理中',
  REFUNDED: '已退款',
  COMPLETED: '已完成',
  CANCELLED: '已取消'
};

async function refreshOrderStatus() {
  if (!currentOrderId) return;
  try {
    const scope = userStore.isBuyerActive ? 'sold' : 'bought';
    const order = await fetchOrderDetail(currentOrderId, scope);
    currentOrderStatus.value = orderStatusText[order.status] || order.rawStatus;
  } catch {
    // 订单主体已由会话接口返回，状态读取失败时保留最近订单卡，避免阻断群聊。
  }
}

function messageAnchor(id: Api.RealNotify.Id) {
  return `message-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function eventPayload(event: unknown) {
  const frame = event as { data?: unknown; payload?: unknown; message?: unknown };
  return frame?.data ?? frame?.payload ?? frame?.message ?? event;
}

function compareBusinessId(left: Api.RealNotify.Id, right: Api.RealNotify.Id): number {
  const leftText = String(left);
  const rightText = String(right);
  if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) {
    const normalizedLeft = leftText.replace(/^0+(?=\d)/, '');
    const normalizedRight = rightText.replace(/^0+(?=\d)/, '');
    return normalizedLeft.length === normalizedRight.length
      ? normalizedLeft.localeCompare(normalizedRight)
      : normalizedLeft.length - normalizedRight.length;
  }
  return leftText.localeCompare(rightText);
}

function appendRealtimeMessage(event: unknown) {
  const candidate = eventPayload(event) as Partial<Api.RealNotify.Message>;
  const activeConversation = conversation.value;
  if (!candidate || typeof candidate !== 'object' || !activeConversation || String(candidate.conversationId) !== String(activeConversation.id) || candidate.id == null) return;
  const existingIndex = messages.value.findIndex(item => String(item.id) === String(candidate.id));
  if (existingIndex >= 0) {
    messages.value[existingIndex] = { ...messages.value[existingIndex], ...candidate } as Api.RealNotify.Message;
    if (candidate.msgType === 'ORDER_CARD' || candidate.msgType === 'SYSTEM') refreshOrderStatus();
    return;
  }
  messages.value.push(candidate as Api.RealNotify.Message);
  markImMessagesRead({ conversationId: activeConversation.id, lastReadMessageId: candidate.id }).catch(() => undefined);
  if (candidate.msgType === 'ORDER_CARD' || candidate.msgType === 'SYSTEM') refreshOrderStatus();
  nextTick(() => { scrollIntoView.value = messageAnchor(candidate.id!); });
}

function applyRealtimeRecall(event: unknown) {
  const payload = eventPayload(event) as {
    id?: Api.RealNotify.Id;
    messageId?: Api.RealNotify.Id;
    conversationId?: Api.RealNotify.Id;
    message?: Partial<Api.RealNotify.Message>;
  };
  const recalled = payload.message;
  const conversationId = recalled?.conversationId ?? payload.conversationId;
  const messageId = recalled?.id ?? payload.messageId ?? payload.id;
  if (!conversation.value || messageId == null || String(conversationId) !== String(conversation.value.id)) return;
  const index = messages.value.findIndex(item => String(item.id) === String(messageId));
  if (index < 0) {
    refreshMessages().catch(() => undefined);
    return;
  }
  messages.value[index] = {
    ...messages.value[index],
    ...recalled,
    recalled: true,
    content: undefined,
    mediaUrl: undefined
  } as Api.RealNotify.Message;
}

function applyRealtimeRead(event: unknown) {
  const payload = eventPayload(event) as Partial<Api.RealNotify.ImReadEvent>;
  const readerId = payload.readerUserId ?? payload.userId;
  if (!conversation.value || readerId == null || payload.lastReadMessageId == null || String(payload.conversationId) !== String(conversation.value.id)) return;
  readerWatermarks.value[String(readerId)] = payload.lastReadMessageId;
}

function handleRealtimeEvent(event: unknown) {
  const type = String((event as { type?: unknown })?.type || '').toUpperCase();
  if (type === 'IM_RECALL') {
    applyRealtimeRecall(event);
    return;
  }
  if (type === 'IM_MESSAGE') {
    appendRealtimeMessage(event);
    return;
  }
  if (type === 'IM_READ') {
    applyRealtimeRead(event);
  }
}

async function refreshMessages() {
  if (!conversation.value) return;
  const page = await fetchMessages({ conversationId: conversation.value.id, pageNo: 1, pageSize: 50 });
  messages.value = [...page.records].reverse();
  await nextTick();
  const last = messages.value.at(-1);
  if (last) {
    scrollIntoView.value = messageAnchor(last.id);
    if (!String(last.id).startsWith('local:')) {
      markImMessagesRead({ conversationId: conversation.value.id, lastReadMessageId: last.id }).catch(() => undefined);
    }
  }
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

async function sendImage() {
  if (!conversation.value || sending.value) return;
  try {
    const picked = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePath = picked.tempFilePaths[0];
    if (!filePath) return;
    sending.value = true;
    const uploaded = await uploadImImage(filePath, conversation.value.id);
    await sendMessage({
      conversationId: conversation.value.id,
      msgType: 'IMAGE',
      mediaFileId: uploaded.id,
      clientMsgId: createClientMessageId()
    });
    await refreshMessages();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '图片发送失败', icon: 'none' });
  } finally {
    sending.value = false;
  }
}

function ensureRecorder() {
  if (!recorder) recorder = uni.getRecorderManager();
  if (recorderBound) return recorder;
  recorderBound = true;
  recorder.onStop(async result => {
    voiceRecording.value = false;
    if (!conversation.value || !result.tempFilePath) return;
    try {
      sending.value = true;
      const duration = Math.max(1, Math.min(60, Math.ceil(result.duration / 1000)));
      const uploaded = await uploadImVoice(result.tempFilePath, duration, conversation.value.id);
      await sendMessage({
        conversationId: conversation.value.id,
        msgType: 'VOICE',
        mediaFileId: uploaded.id,
        clientMsgId: createClientMessageId()
      });
      await refreshMessages();
    } catch (error) {
      uni.showToast({ title: error instanceof Error ? error.message : '语音发送失败', icon: 'none' });
    } finally {
      sending.value = false;
    }
  });
  recorder.onError(() => {
    voiceRecording.value = false;
    uni.showToast({ title: '录音不可用，请检查浏览器权限', icon: 'none' });
  });
  return recorder;
}

function startVoice() {
  if (sending.value || voiceRecording.value) return;
  try {
    ensureRecorder().start({ format: 'mp3' });
    voiceRecording.value = true;
  } catch {
    uni.showToast({ title: '当前环境不支持录音', icon: 'none' });
  }
}

function stopVoice() {
  if (!voiceRecording.value) return;
  ensureRecorder().stop();
}

function playVoice(message: Api.RealNotify.Message) {
  if (!message.mediaUrl || message.recalled) {
    uni.showToast({ title: '语音资源暂不可用', icon: 'none' });
    return;
  }
  const id = String(message.id);
  if (playingVoiceId.value === id) {
    voicePlayer?.stop();
    playingVoiceId.value = undefined;
    return;
  }
  if (!voicePlayer) {
    voicePlayer = uni.createInnerAudioContext();
    voicePlayer.onEnded(() => { playingVoiceId.value = undefined; });
    voicePlayer.onStop(() => { playingVoiceId.value = undefined; });
    voicePlayer.onError(() => {
      playingVoiceId.value = undefined;
      uni.showToast({ title: '语音播放失败', icon: 'none' });
    });
  }
  voicePlayer.stop();
  voicePlayer.src = message.mediaUrl;
  playingVoiceId.value = id;
  voicePlayer.play();
}

function recallMessage(message: Api.RealNotify.Message) {
  if (!conversation.value || message.recalled || String(message.senderId) !== String(userStore.currentUser?.id)) return;
  uni.showModal({
    title: '撤回消息？',
    success: async result => {
      if (!result.confirm) return;
      try {
        await recallImMessage({ id: message.id });
        await refreshMessages();
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '撤回失败', icon: 'none' });
      }
    }
  });
}

function retryRealtime() {
  imSocket.restart().catch(() => undefined);
}

onLoad(async query => {
  const orderId = String(query?.orderId || '');
  if (!orderId) return;
  currentOrderId = orderId;
  try {
    const [group] = await Promise.all([
      fetchConversationByOrder(orderId),
      refreshOrderStatus()
    ]);
    conversation.value = group;
    await refreshMessages();
    unsubscribe = imSocket.subscribe(handleRealtimeEvent);
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
  if (voiceRecording.value) ensureRecorder().stop();
  voicePlayer?.stop();
  voicePlayer?.destroy();
  voicePlayer = undefined;
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

function isMine(message: Api.RealNotify.Message) {
  return String(message.senderId) === String(userStore.currentUser?.id);
}

function readText(message: Api.RealNotify.Message) {
  if (!isMine(message) || message.pending || message.failed || message.recalled || String(message.id).startsWith('local:')) return '';
  const count = Object.values(readerWatermarks.value)
    .filter(lastReadMessageId => compareBusinessId(lastReadMessageId, message.id) >= 0)
    .length;
  return count ? `已读 ${count}` : '未读';
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
        <view class="bubble" :class="side(message)"><image v-if="message.msgType === 'IMAGE' && message.mediaUrl && !message.recalled" :src="message.mediaUrl" mode="widthFix" class="message-image" /><text v-else-if="message.msgType === 'VOICE' && !message.recalled" class="voice-message" @click="playVoice(message)">{{ playingVoiceId === String(message.id) ? '播放中…' : '▶ 语音消息' }}{{ message.duration ? ` · ${message.duration} 秒` : '' }}</text><text v-else>{{ messageText(message) }}</text></view>
        <text v-if="isMine(message) && !message.recalled && !message.pending && !message.failed && side(message) !== 'center'" class="recall" @click="recallMessage(message)">撤回</text>
        <text v-if="message.pending" class="delivery">发送中</text>
        <text v-else-if="message.failed" class="delivery retry" @click="retryMessage(message)">发送失败，点击重试</text>
        <text v-else-if="readText(message)" class="delivery">{{ readText(message) }}</text>
      </view>
      <view v-if="!messages.length" class="empty">暂无历史消息</view>
    </scroll-view>
    <view class="composer">
      <view class="image-picker" :class="{ disabled: sending }" @click="sendImage">图片</view>
      <view class="voice-picker" :class="{ recording: voiceRecording, disabled: sending }" @touchstart="startVoice" @touchend="stopVoice" @touchcancel="stopVoice">{{ voiceRecording ? '松开发送' : '按住说话' }}</view>
      <input v-model="inputText" class="input" placeholder="输入消息" :disabled="sending" confirm-type="send" @confirm="sendText()" />
      <view class="send" :class="{ disabled: !inputText.trim() || sending }" @click="sendText()">{{ sending ? '发送中' : '发送' }}</view>
    </view>
  </view>
  <EmptyState v-else title="三方群不存在" />
</template>

<style lang="scss" scoped>
.page { height: 100%; display: flex; flex-direction: column; background: #f7f8fa; }
.header { padding: 20rpx 32rpx; background: #fff; border-bottom: 1rpx solid #f2f3f5; }.title,.meta,.sender { display:block; }.title{font-size:30rpx;font-weight:600}.meta,.sender{font-size:22rpx;color:#86909c;margin-top:4rpx}.messages{flex:1;min-height:0;padding:16rpx}.row{display:flex;flex-direction:column;margin-bottom:20rpx}.row.right{align-items:flex-end}.row.center{align-items:center}.bubble{max-width:75%;padding:16rpx 20rpx;border-radius:16rpx;background:#fff;color:#1d2129;font-size:26rpx;word-break:break-word}.bubble.right{background:#4d80f0;color:#fff}.bubble.center{background:#f2f3f5;color:#86909c;font-size:22rpx}.empty{text-align:center;color:#86909c;padding:60rpx 0}
.realtime-notice{display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding:12rpx 32rpx;background:#fff7e6;color:#d46b08;font-size:22rpx}.retry{color:#4d80f0}.delivery,.recall{font-size:20rpx;color:#86909c;margin-top:4rpx}.recall{color:#4d80f0}.message-image{display:block;max-width:420rpx;border-radius:8rpx}.voice-message{display:block;min-width:150rpx}.composer{display:flex;align-items:center;gap:12rpx;padding:16rpx 24rpx;padding-bottom:calc(16rpx + env(safe-area-inset-bottom));background:#fff;border-top:1rpx solid #f2f3f5}.image-picker,.voice-picker{flex-shrink:0;color:#4d80f0;font-size:24rpx}.image-picker.disabled,.voice-picker.disabled{color:#c9cdd4}.voice-picker.recording{color:#d4380d}.input{flex:1;min-width:0;height:64rpx;padding:0 24rpx;box-sizing:border-box;border-radius:32rpx;background:#f7f8fa;font-size:26rpx}.send{padding:16rpx 28rpx;border-radius:32rpx;background:#4d80f0;color:#fff;font-size:26rpx;font-weight:600}.send.disabled{background:#c9cdd4}
</style>
