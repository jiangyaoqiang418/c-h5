<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchConversationByOrder, fetchIncrementalMessages, fetchMessages, markImMessagesRead, recallImMessage, sendMessage, uploadImImage, uploadImVoice } from '@/service/api/notify';
import { fetchOrderDetail } from '@/service/api/order';
import { imSocket, type ImSocketState } from '@/service/im-socket';
import { useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { RequestError } from '@/service/request';
import { getAccessToken } from '@/service/request/token';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const conversation = ref<Api.RealNotify.Conversation>();
const loading = ref(true);
const loadFailed = ref(false);
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
let needsIncrementalRecovery = false;
const pageVisible = ref(false);
const atBottom = ref(true);
const hasNewMessages = ref(false);
const loadingHistory = ref(false);
const hasMoreHistory = ref(false);
let historyPageNo = 2;
let lastScrollTop = 0;
let destroyed = false;
let recovering = false;
let recoveryTask: Promise<void> | undefined;
let recoveryGeneration = 0;
let readTask: Promise<void> | undefined;
let acknowledgedReadId: Api.RealNotify.Id | undefined;
let queuedReadId: Api.RealNotify.Id | undefined;
const historyLoadFailed = ref(false);
let recoveryCursor: Api.RealNotify.Id | undefined;
let hasRecoveryCursor = false;
let cancelRecording = true;
let recordingConversationId: Api.RealNotify.Id | undefined;
const pendingMediaRequests = new Map<string, Api.RealNotify.SendMessageParams>();
let initVersion = 0;
let initializing = false;
let historyVersion = 0;
let refreshTask: Promise<void> | undefined;
let owner: { userId: string; operation: ReturnType<ReturnType<typeof usePageOperation>['capture']> } | undefined;
const recallingId = ref('');
const uncertainRecalls = ref<string[]>([]);
const page = usePageOperation(clearPrivateState);
let recordingScope: ReturnType<typeof captureConversation> | undefined;
// stop 回调尚未到达时禁止开始下一段，避免把上一段音频归到新录音/新账号。
let recorderStopping = false;

function sessionCurrent() {
  return !destroyed && !!owner && owner.operation.sameSession() && !!userStore.currentUser
    && owner.userId === String(userStore.realUserId);
}

function captureConversation() {
  const operation = page.capture();
  const currentOwner = owner;
  const conversationId = conversation.value?.id;
  const sameConversation = () => sessionCurrent() && owner === currentOwner && operation.sameSession()
    && conversationId != null && String(conversation.value?.id) === String(conversationId);
  return { operation, conversationId, sameConversation, isCurrent: () => sameConversation() && operation.isCurrent() };
}

function detachRealtime() {
  unsubscribe?.(); unsubscribe = undefined;
  unsubscribeState?.(); unsubscribeState = undefined;
  imSocket.stopIfUnused();
}

function clearPrivateState() {
  initVersion++; historyVersion++; recoveryGeneration++;
  initializing = false;
  owner = undefined;
  detachRealtime();
  discardVoice();
  recordingScope = undefined;
  voicePlayer?.stop(); voicePlayer?.destroy(); voicePlayer = undefined;
  conversation.value = undefined;
  messages.value = []; inputText.value = ''; readerWatermarks.value = {};
  pendingMediaRequests.clear();
  loading.value = false; loadFailed.value = false; sending.value = false;
  loadingHistory.value = false; historyLoadFailed.value = false; hasMoreHistory.value = false;
  realtimeState.value = 'idle'; currentOrderStatus.value = ''; scrollIntoView.value = '';
  playingVoiceId.value = undefined; recallingId.value = ''; uncertainRecalls.value = [];
  atBottom.value = true; hasNewMessages.value = false; lastScrollTop = 0; historyPageNo = 2;
  acknowledgedReadId = undefined; queuedReadId = undefined; readTask = undefined;
  recoveryTask = undefined; refreshTask = undefined; recovering = false;
  recoveryCursor = undefined; hasRecoveryCursor = false; needsIncrementalRecovery = false;
}

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
  const message = [...messages.value].reverse().find(item => item.msgType === 'ORDER_CARD');
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
  if (!currentOrderId || !sessionCurrent() || !pageVisible.value) return;
  const scope = captureConversation();
  try {
    const order = await fetchOrderDetail(currentOrderId, conversation.value?.myRole === 'SELLER' ? 'sold' : 'bought');
    if (!scope.isCurrent() || String(order.id) !== currentOrderId) return;
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
  if (!sessionCurrent() || !candidate || typeof candidate !== 'object' || !activeConversation || String(candidate.conversationId) !== String(activeConversation.id) || candidate.id == null) return;
  mergeServerMessages([candidate as Api.RealNotify.Message]);
  if (candidate.msgType === 'ORDER_CARD' || candidate.msgType === 'SYSTEM') refreshOrderStatus();
  revealNewMessages();
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
  if (!sessionCurrent() || !conversation.value || messageId == null || String(conversationId) !== String(conversation.value.id)) return;
  uncertainRecalls.value = uncertainRecalls.value.filter(id => id !== String(messageId));
  stopRecalledVoice(messageId);
  const index = messages.value.findIndex(item => String(item.id) === String(messageId));
  if (index < 0) {
    if (pageVisible.value) retryHistory();
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

function stopRecalledVoice(id: Api.RealNotify.Id) {
  if (playingVoiceId.value !== String(id)) return;
  voicePlayer?.stop();
  playingVoiceId.value = undefined;
}

function applyRealtimeRead(event: unknown) {
  const payload = eventPayload(event) as Partial<Api.RealNotify.ImReadEvent>;
  const readerId = payload.readerUserId ?? payload.userId;
  if (!sessionCurrent() || !conversation.value || readerId == null || payload.lastReadMessageId == null || String(payload.conversationId) !== String(conversation.value.id)) return;
  const readerKey = String(readerId);
  const previous = readerWatermarks.value[readerKey];
  if (!previous || compareBusinessId(payload.lastReadMessageId, previous) > 0) {
    readerWatermarks.value[readerKey] = payload.lastReadMessageId;
  }
}

function handleRealtimeEvent(event: unknown) {
  if (!sessionCurrent()) return;
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

function refreshMessages(): Promise<void> {
  if (!sessionCurrent() || !conversation.value || !pageVisible.value) return Promise.resolve();
  if (refreshTask) return refreshTask;
  const scope = captureConversation();
  const task = refreshMessageBatch(scope).finally(() => { if (refreshTask === task) refreshTask = undefined; });
  refreshTask = task;
  return task;
}

function validMessages(records: Api.RealNotify.Message[], conversationId: Api.RealNotify.Id) {
  if (!Array.isArray(records) || records.some(message => !message || message.id == null
    || String(message.id).startsWith('local:') || String(message.conversationId) !== String(conversationId))) {
    throw new Error('消息记录缺失或会话不匹配，请重试');
  }
}

async function refreshMessageBatch(scope: ReturnType<typeof captureConversation>) {
  if (recoveryTask) await recoveryTask;
  if (!scope.isCurrent()) return;
  const conversationId = scope.conversationId!;
  // 第一页契约会自动推进已读。用第二页作锚点，再用无已读副作用的增量接口补最新消息。
  const page = await fetchMessages({ conversationId, pageNo: 2, pageSize: 50 });
  if (!scope.isCurrent()) return;
  validMessages(page.records, conversationId);
  if (page.total == null || !Number.isSafeInteger(Number(page.total)) || Number(page.total) < 0) throw new Error('消息分页总数无效');
  mergeServerMessages(page.records);
  if (!hasRecoveryCursor) {
    recoveryCursor = page.records.reduce<Api.RealNotify.Id | undefined>((latest, message) => latest == null || compareBusinessId(message.id, latest) > 0 ? message.id : latest, undefined);
    hasRecoveryCursor = true;
  }
  historyPageNo = Math.max(2, historyPageNo);
  await recoverIncrementalMessages();
  if (!scope.isCurrent()) return;
  historyLoadFailed.value = false;
  hasMoreHistory.value = messages.value.filter(item => !String(item.id).startsWith('local:')).length < page.total;
  revealNewMessages();
}

async function loadOlderMessages() {
  if (!sessionCurrent() || !conversation.value || !hasMoreHistory.value || loadingHistory.value || !pageVisible.value || refreshTask) return;
  const scope = captureConversation();
  const version = ++historyVersion;
  const current = () => scope.isCurrent() && version === historyVersion;
  loadingHistory.value = true;
  atBottom.value = false;
  const anchor = messages.value[0]?.id;
  try {
    const page = await fetchMessages({ conversationId: scope.conversationId!, pageNo: historyPageNo + 1, pageSize: 50 });
    if (!current()) return;
    validMessages(page.records, scope.conversationId!);
    if (page.total == null || !Number.isSafeInteger(Number(page.total)) || Number(page.total) < 0) throw new Error('消息分页总数无效');
    if (!page.records.length && messages.value.filter(item => !String(item.id).startsWith('local:')).length < Number(page.total)) {
      throw new Error('历史消息分页不完整，请重试原页');
    }
    mergeServerMessages(page.records);
    historyPageNo++;
    hasMoreHistory.value = page.records.length > 0 && messages.value.filter(item => !String(item.id).startsWith('local:')).length < page.total;
    await nextTick();
    if (current() && anchor != null) scrollIntoView.value = messageAnchor(anchor);
  } catch {
    if (current()) uni.showToast({ title: '历史消息加载失败，请重试', icon: 'none' });
  } finally {
    if (scope.sameConversation() && version === historyVersion) loadingHistory.value = false;
  }
}

function markVisibleRead() {
  const id = latestServerMessageId();
  if (!sessionCurrent() || !pageVisible.value || !atBottom.value || !conversation.value || id == null) return;
  if (acknowledgedReadId != null && compareBusinessId(id, acknowledgedReadId) <= 0) return;
  if (queuedReadId == null || compareBusinessId(id, queuedReadId) > 0) queuedReadId = id;
  if (readTask) return;
  const task = flushVisibleRead().finally(() => { if (readTask === task) readTask = undefined; });
  readTask = task;
}

async function flushVisibleRead() {
  const scope = captureConversation();
  if (!scope.isCurrent()) return;
  try {
    while (scope.isCurrent() && atBottom.value && queuedReadId != null) {
      const id = queuedReadId;
      if (acknowledgedReadId != null && compareBusinessId(id, acknowledgedReadId) <= 0) break;
      const accepted = await markImMessagesRead({ conversationId: scope.conversationId!, lastReadMessageId: id });
      if (accepted !== true || !scope.sameConversation()) break;
      if (acknowledgedReadId == null || compareBusinessId(id, acknowledgedReadId) > 0) acknowledgedReadId = id;
    }
  } catch {
    // 失败不推进本机已读水位；下次到达底部/显示页面时可重试，不立即循环轰炸接口。
  }
}

async function revealNewMessages() {
  if (!sessionCurrent()) return;
  const scope = captureConversation();
  if (!pageVisible.value || !atBottom.value) { hasNewMessages.value = true; return; }
  await nextTick();
  if (!scope.isCurrent() || !atBottom.value) return;
  const last = messages.value.at(-1);
  if (last) scrollIntoView.value = messageAnchor(last.id);
  hasNewMessages.value = false;
  markVisibleRead();
}

function scrollChanged(event: { detail: { scrollTop: number } }) {
  if (event.detail.scrollTop < lastScrollTop - 2) atBottom.value = false;
  lastScrollTop = event.detail.scrollTop;
}

function reachedBottom() {
  atBottom.value = true;
  hasNewMessages.value = false;
  markVisibleRead();
}

function showLatestMessages() {
  atBottom.value = true;
  revealNewMessages();
}

function latestServerMessageId() {
  return messages.value.reduce<Api.RealNotify.Id | undefined>((latest, message) => {
    if (String(message.id).startsWith('local:')) return latest;
    return latest == null || compareBusinessId(message.id, latest) > 0 ? message.id : latest;
  }, undefined);
}

function mergeServerMessages(incoming: Api.RealNotify.Message[]) {
  if (!sessionCurrent() || !conversation.value) return;
  incoming.forEach(message => {
    if (String(message.conversationId) !== String(conversation.value!.id)) return;
    const matches = (current: Api.RealNotify.Message) => String(current.id) === String(message.id)
      || (!!message.clientMsgId && current.clientMsgId === message.clientMsgId && String(current.senderId) === String(message.senderId));
    const previous = messages.value.find(matches);
    const merged = { ...previous, ...message, pending: false, failed: false };
    if (previous?.recalled || message.recalled) {
      Object.assign(merged, { recalled: true, content: undefined, mediaUrl: undefined });
      stopRecalledVoice(message.id);
      if (previous) stopRecalledVoice(previous.id);
      uncertainRecalls.value = uncertainRecalls.value.filter(id => id !== String(message.id));
    }
    messages.value = messages.value.filter(current => !matches(current));
    messages.value.push(merged);
    if (message.clientMsgId && String(message.senderId) === String(userStore.realUserId)) pendingMediaRequests.delete(message.clientMsgId);
  });
  messages.value.sort((left, right) => {
    const leftLocal = String(left.id).startsWith('local:');
    const rightLocal = String(right.id).startsWith('local:');
    if (leftLocal || rightLocal) return Number(left.createdAt || 0) - Number(right.createdAt || 0);
    return compareBusinessId(left.id, right.id);
  });
}

function recoverIncrementalMessages(): Promise<void> {
  if (!sessionCurrent() || !conversation.value || !pageVisible.value) return Promise.resolve();
  if (!recoveryTask) {
    const scope = captureConversation();
    const task = (async () => {
      while (scope.isCurrent()) {
        const generation = recoveryGeneration;
        await recoverIncrementalBatch();
        // 新的 READY 可能发生在旧补偿未完成时，继续处理新断线边界，不能只复用旧任务后退出。
        if (generation === recoveryGeneration || realtimeState.value !== 'ready') break;
      }
    })().finally(() => { if (recoveryTask === task) recoveryTask = undefined; });
    recoveryTask = task;
  }
  return recoveryTask;
}

async function recoverIncrementalBatch() {
  if (!sessionCurrent() || !conversation.value || recovering || !pageVisible.value) return;
  const scope = captureConversation();
  recovering = true;
  const generation = recoveryGeneration;
  let sinceId = hasRecoveryCursor ? recoveryCursor : latestServerMessageId();
  hasRecoveryCursor = true;
  recoveryCursor = sinceId;
  try {
    while (scope.isCurrent()) {
      const incoming = await fetchIncrementalMessages({ conversationId: scope.conversationId!, sinceId, limit: 500 });
      if (!scope.isCurrent()) return;
      validMessages(incoming, scope.conversationId!);
      if (!incoming.length) break;
      const nextId = incoming.at(-1)!.id;
      if (sinceId != null && compareBusinessId(nextId, sinceId) <= 0) throw new Error('消息增量游标未推进');
      mergeServerMessages(incoming);
      sinceId = nextId;
      recoveryCursor = sinceId;
      if (incoming.length < 500) break;
    }
    revealNewMessages();
    if (scope.isCurrent() && generation === recoveryGeneration) {
      hasRecoveryCursor = false;
      needsIncrementalRecovery = false;
    }
  } finally {
    if (scope.isCurrent()) recovering = false;
  }
}

function createClientMessageId() {
  return `im-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sendText(content = inputText.value.trim(), retry?: Api.RealNotify.Message) {
  if (!sessionCurrent() || !conversation.value || sending.value || voiceRecording.value || !content || !pageVisible.value) return;
  const scope = captureConversation();
  const clientMsgId = retry?.clientMsgId || createClientMessageId();
  const localMessage: Api.RealNotify.Message = {
    id: `local:${clientMsgId}`,
    conversationId: scope.conversationId!,
    senderId: userStore.realUserId,
    senderName: '我',
    msgType: 'TEXT',
    content,
    clientMsgId,
    createdAt: String(Date.now()),
    pending: true
  };
  if (retry) { retry.pending = true; retry.failed = false; }
  else { messages.value.push(localMessage); inputText.value = ''; }
  sending.value = true;
  try {
    await nextTick();
    if (!scope.isCurrent()) throw new Error('页面已离开，消息未发送');
    scrollIntoView.value = messageAnchor(localMessage.id);
    const result = await sendMessage({ conversationId: scope.conversationId!, msgType: 'TEXT', content, clientMsgId });
    if (!scope.sameConversation()) return;
    validateSentMessage(result, localMessage);
    mergeServerMessages([result]); revealNewMessages();
  } catch {
    if (!scope.sameConversation()) return;
    const pending = messages.value.find(item => item.clientMsgId === clientMsgId);
    if (pending && String(pending.id).startsWith('local:')) {
      pending.pending = false;
      pending.failed = true;
    }
  } finally {
    if (scope.sameConversation()) sending.value = false;
  }
}

async function retryMessage(message: Api.RealNotify.Message) {
  if (!sessionCurrent() || !message.failed || !message.clientMsgId || sending.value || voiceRecording.value || !pageVisible.value
    || String(message.senderId) !== String(userStore.realUserId) || String(message.conversationId) !== String(conversation.value?.id)) return;
  if (message.msgType === 'TEXT' && message.content) return sendText(message.content, message);
  const request = pendingMediaRequests.get(message.clientMsgId);
  if (!request) return;
  const scope = captureConversation();
  sending.value = true;
  try { await deliverMedia(request, message); } finally { if (scope.sameConversation()) sending.value = false; }
}

function validateSentMessage(result: Api.RealNotify.Message, draft: Api.RealNotify.Message) {
  validMessages([result], draft.conversationId);
  if (String(result.senderId) !== String(draft.senderId) || result.clientMsgId !== draft.clientMsgId || result.msgType !== draft.msgType) {
    throw new Error('发送回执与原消息不匹配，请核对后重试');
  }
}

async function deliverMedia(request: Api.RealNotify.SendMessageParams, localMessage: Api.RealNotify.Message, scope = captureConversation()) {
  if (!scope.isCurrent() || String(request.conversationId) !== String(scope.conversationId)
    || String(localMessage.senderId) !== String(userStore.realUserId)) return;
  const clientMsgId = request.clientMsgId!;
  pendingMediaRequests.set(clientMsgId, request);
  localMessage.pending = true;
  localMessage.failed = false;
  if (!messages.value.some(item => item.clientMsgId === clientMsgId && String(item.senderId) === String(localMessage.senderId))) messages.value.push(localMessage);
  revealNewMessages();
  try {
    const result = await sendMessage(request);
    if (!scope.sameConversation()) return;
    validateSentMessage(result, localMessage);
    mergeServerMessages([result]); revealNewMessages();
  } catch {
    if (!scope.sameConversation()) return;
    const local = messages.value.find(item => item.clientMsgId === clientMsgId && String(item.senderId) === String(localMessage.senderId));
    if (local && String(local.id).startsWith('local:')) { local.pending = false; local.failed = true; }
  }
}

function mediaDraft(conversationId: Api.RealNotify.Id, type: 'IMAGE' | 'VOICE', uploaded: Api.RealNotify.MediaUploadResult, duration?: number) {
  const clientMsgId = createClientMessageId();
  const request: Api.RealNotify.SendMessageParams = { conversationId, msgType: type, mediaFileId: uploaded.id, clientMsgId };
  const message: Api.RealNotify.Message = {
    id: `local:${clientMsgId}`, conversationId, senderId: userStore.realUserId, senderName: '我', msgType: type,
    clientMsgId, mediaUrl: uploaded.url, duration: uploaded.duration ?? duration, createdAt: String(Date.now()), pending: true
  };
  return { request, message };
}

async function sendImage() {
  if (!sessionCurrent() || !conversation.value || sending.value || voiceRecording.value || !pageVisible.value) return;
  const scope = captureConversation();
  const conversationId = scope.conversationId!;
  sending.value = true;
  try {
    const picked = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePath = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths[0] : picked.tempFilePaths;
    if (!filePath || !scope.sameConversation() || !scope.operation.afterPicker()) return;
    const uploaded = await uploadImImage(filePath, conversationId);
    if (!scope.isCurrent()) return;
    const draft = mediaDraft(conversationId, 'IMAGE', uploaded);
    await deliverMedia(draft.request, draft.message, scope);
  } catch (error) {
    if (!scope.isCurrent()) return;
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '图片发送失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    if (scope.sameConversation()) sending.value = false;
  }
}

function ensureRecorder() {
  if (!recorder) recorder = uni.getRecorderManager();
  if (recorderBound) return recorder;
  recorderBound = true;
  recorder.onStop(async result => {
    const scope = recordingScope;
    recordingScope = undefined;
    recorderStopping = false;
    if (!scope?.sameConversation()) return;
    voiceRecording.value = false;
    const conversationId = recordingConversationId;
    if (cancelRecording || !scope.isCurrent() || conversationId == null || !result.tempFilePath) return;
    try {
      sending.value = true;
      const duration = Math.max(1, Math.min(60, Math.ceil(result.duration / 1000)));
      const uploaded = await uploadImVoice(result.tempFilePath, duration, conversationId);
      if (cancelRecording || !scope.isCurrent()) return;
      const draft = mediaDraft(conversationId, 'VOICE', uploaded, duration);
      await deliverMedia(draft.request, draft.message);
    } catch (error) {
      if (scope.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '语音发送失败', icon: 'none' });
    } finally {
      if (scope.sameConversation()) sending.value = false;
    }
  });
  recorder.onError(() => {
    const scope = recordingScope;
    recordingScope = undefined;
    recorderStopping = false;
    if (!scope?.sameConversation()) return;
    cancelRecording = true;
    voiceRecording.value = false;
    if (scope.isCurrent()) uni.showToast({ title: '录音不可用，请检查浏览器权限', icon: 'none' });
  });
  return recorder;
}

function startVoice() {
  if (!sessionCurrent() || sending.value || voiceRecording.value || recorderStopping || !conversation.value || !pageVisible.value) return;
  try {
    cancelRecording = false;
    recordingConversationId = conversation.value.id;
    recordingScope = captureConversation();
    ensureRecorder().start({ format: 'mp3' });
    voiceRecording.value = true;
  } catch {
    recordingScope = undefined;
    cancelRecording = true;
    uni.showToast({ title: '当前环境不支持录音', icon: 'none' });
  }
}

function stopVoice() {
  if (!voiceRecording.value || recorderStopping) return;
  recorderStopping = true;
  ensureRecorder().stop();
}

function discardVoice() {
  cancelRecording = true;
  if (voiceRecording.value && !recorderStopping) {
    recorderStopping = true;
    try { recorder?.stop(); } catch { recorderStopping = false; }
  }
  voiceRecording.value = false;
}

function playVoice(message: Api.RealNotify.Message) {
  if (!sessionCurrent() || !pageVisible.value || String(message.conversationId) !== String(conversation.value?.id)) return;
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
    const player = voicePlayer;
    const scope = captureConversation();
    voicePlayer.onEnded(() => { if (voicePlayer === player && scope.sameConversation()) playingVoiceId.value = undefined; });
    voicePlayer.onStop(() => { if (voicePlayer === player && scope.sameConversation()) playingVoiceId.value = undefined; });
    voicePlayer.onError(() => {
      if (voicePlayer !== player || !scope.sameConversation()) return;
      playingVoiceId.value = undefined;
      if (pageVisible.value) uni.showToast({ title: '语音播放失败', icon: 'none' });
    });
  }
  voicePlayer.stop();
  voicePlayer.src = message.mediaUrl;
  playingVoiceId.value = id;
  voicePlayer.play();
}

function canRecall(message: Api.RealNotify.Message) {
  return sessionCurrent() && pageVisible.value && !recallingId.value && !message.recalled && !message.pending && !message.failed
    && !String(message.id).startsWith('local:') && !uncertainRecalls.value.includes(String(message.id))
    && ['TEXT', 'IMAGE', 'VOICE'].includes(message.msgType) && String(message.senderId) === String(userStore.realUserId)
    && String(message.conversationId) === String(conversation.value?.id);
}

async function recallMessage(message: Api.RealNotify.Message) {
  if (!canRecall(message)) return;
  const scope = captureConversation();
  const messageId = message.id;
  recallingId.value = String(messageId);
  let sent = false;
  try {
    const result = await uni.showModal({ title: '撤回消息？' });
    if (!result.confirm || !scope.isCurrent()) return;
    const latest = messages.value.find(item => String(item.id) === String(messageId));
    if (!latest || latest.recalled || latest.pending || latest.failed || !['TEXT', 'IMAGE', 'VOICE'].includes(latest.msgType)
      || String(latest.senderId) !== String(userStore.realUserId) || String(latest.conversationId) !== String(scope.conversationId)) return;
    sent = true;
    const accepted = await recallImMessage({ id: messageId });
    if (!scope.sameConversation()) return;
    if (accepted === false) throw new RequestError({ kind: 'business', message: '撤回未被受理，请核对消息状态' });
    if (accepted !== true) throw new Error('撤回回执缺失，请核对消息状态');
    applyRealtimeRecall({ data: { conversationId: scope.conversationId, messageId } });
  } catch (error) {
    if (!scope.sameConversation()) return;
    const rejected = error instanceof RequestError && ['business', 'config'].includes(error.kind);
    const recalled = messages.value.some(item => String(item.id) === String(messageId) && item.recalled);
    if (sent && !rejected && !recalled) uncertainRecalls.value = [...new Set([...uncertainRecalls.value, String(messageId)])];
    if (scope.isCurrent() && !recalled) uni.showToast({ title: uncertainRecalls.value.includes(String(messageId))
      ? '撤回结果待核对，请刷新消息，不要重复操作' : error instanceof Error ? error.message : '撤回失败', icon: 'none' });
  } finally {
    if (scope.sameConversation() && recallingId.value === String(messageId)) recallingId.value = '';
  }
}

function retryRealtime() {
  if (!sessionCurrent() || !pageVisible.value) return;
  rememberRecoveryBoundary();
  imSocket.restart().catch(() => undefined);
}

function rememberRecoveryBoundary() {
  recoveryGeneration++;
  needsIncrementalRecovery = true;
  if (!hasRecoveryCursor) {
    recoveryCursor = latestServerMessageId();
    hasRecoveryCursor = true;
  }
}

onLoad(query => { currentOrderId = String(query?.orderId || ''); });

async function initialize() {
  if (!pageVisible.value || destroyed || initializing) return;
  if (!currentOrderId) {
    loading.value = false;
    return;
  }
  if (sessionCurrent() && conversation.value) return retryHistory();
  const operation = page.capture();
  const version = ++initVersion;
  const current = () => operation.isCurrent() && pageVisible.value && version === initVersion;
  initializing = true;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账号资料加载失败，请重试');
      await requireLogin(`/pages/im/real-order-group?orderId=${encodeURIComponent(currentOrderId)}`);
      return;
    }
    if (!userStore.realUserId) throw new Error('账号标识缺失，请重试');
    const group = await fetchConversationByOrder(currentOrderId);
    if (!current()) return;
    if (!group || group.id == null || !String(group.id).trim() || (typeof group.id === 'number' && !Number.isSafeInteger(group.id))
      || group.bizType !== 'ORDER' || String(group.bizId) !== currentOrderId || !['CUSTOMER', 'SELLER', 'ADMIN'].includes(group.myRole || '')) {
      throw new Error('订单群会话或成员身份不匹配，请重新加载');
    }
    detachRealtime();
    owner = { userId: String(userStore.realUserId), operation };
    conversation.value = group;
    acknowledgedReadId = group.lastReadMessageId;
    const scope = captureConversation();
    unsubscribe = imSocket.subscribe(event => { if (scope.sameConversation()) handleRealtimeEvent(event); });
    unsubscribeState = imSocket.subscribeState(state => {
      if (!scope.sameConversation()) return;
      realtimeState.value = state;
      if (state === 'unavailable') rememberRecoveryBoundary();
      if (state === 'ready' && needsIncrementalRecovery && pageVisible.value) {
        recoverIncrementalMessages().catch(() => { if (scope.sameConversation()) historyLoadFailed.value = true; });
      }
    });
    imSocket.start().catch(() => undefined);
    refreshOrderStatus();
    await refreshMessages();
  } catch (error) {
    if (!current()) return;
    historyLoadFailed.value = true;
    if (!conversation.value) loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '订单群加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && version === initVersion) { loading.value = false; initializing = false; }
  }
}

async function retryHistory() {
  const scope = captureConversation();
  if (!scope.isCurrent()) return;
  try { await refreshMessages(); }
  catch {
    if (scope.isCurrent()) { historyLoadFailed.value = true; uni.showToast({ title: '消息加载失败，请重试', icon: 'none' }); }
  }
}

onShow(() => {
  pageVisible.value = true;
  if (!conversation.value || !sessionCurrent()) return initialize();
  refreshOrderStatus();
  if (historyLoadFailed.value) return retryHistory();
  const scope = captureConversation();
  return recoverIncrementalMessages().then(() => { if (scope.isCurrent()) markVisibleRead(); }).catch(() => {
    if (scope.isCurrent()) { needsIncrementalRecovery = true; historyLoadFailed.value = true; }
  });
});

onHide(() => {
  rememberRecoveryBoundary();
  pageVisible.value = false;
  initVersion++; historyVersion++; initializing = false; loading.value = false; loadingHistory.value = false;
  if (refreshTask) historyLoadFailed.value = true;
  refreshTask = undefined; recoveryTask = undefined; recovering = false; readTask = undefined;
  discardVoice();
  voicePlayer?.stop();
});

onUnload(() => {
  destroyed = true;
  pageVisible.value = false;
  clearPrivateState();
});

function side(message: Api.RealNotify.Message) {
  if (message.msgType === 'SYSTEM' || message.msgType === 'ORDER_CARD') return 'center';
  return String(message.senderId) === String(userStore.realUserId) ? 'right' : 'left';
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
  return String(message.senderId) === String(userStore.realUserId);
}

function readText(message: Api.RealNotify.Message) {
  if (!isMine(message) || message.pending || message.failed || message.recalled || String(message.id).startsWith('local:')) return '';
  const count = Object.entries(readerWatermarks.value)
    .filter(([readerId, lastReadMessageId]) => String(readerId) !== String(userStore.realUserId) && compareBusinessId(lastReadMessageId, message.id) >= 0)
    .length;
  return count ? `已读 ${count}` : '未读';
}
</script>

<template>
  <view v-if="loading" class="state-loading">订单群加载中…</view>
  <view v-else-if="conversation" class="page">
    <view class="header"><text class="title">{{ headerTitle }}</text><text class="meta">{{ headerMeta }}</text></view>
    <view v-if="historyLoadFailed" class="realtime-notice" @click="retryHistory">消息加载失败，点击重新加载</view>
    <view v-if="realtimeState !== 'ready'" class="realtime-notice">
      <text>{{ realtimeState === 'connecting' ? '正在连接实时服务…' : '实时连接暂不可用，消息仍可发送并在刷新后同步。' }}</text>
      <text v-if="realtimeState === 'unavailable'" class="retry" @click="retryRealtime">重连</text>
    </view>
    <scroll-view scroll-y class="messages" :scroll-into-view="scrollIntoView" @scroll="scrollChanged" @scrolltolower="reachedBottom" @scrolltoupper="loadOlderMessages">
      <view v-if="hasMoreHistory" class="empty" @click="loadOlderMessages">{{ loadingHistory ? '历史消息加载中…' : '加载更早消息' }}</view>
      <view v-for="message in messages" :id="messageAnchor(message.id)" :key="message.id" class="row" :class="side(message)">
        <text v-if="side(message) === 'left'" class="sender">{{ message.senderName || '系统' }}</text>
        <view class="bubble" :class="side(message)"><image v-if="message.msgType === 'IMAGE' && message.mediaUrl && !message.recalled" :src="message.mediaUrl" mode="widthFix" class="message-image" /><text v-else-if="message.msgType === 'VOICE' && !message.recalled" class="voice-message" @click="playVoice(message)">{{ playingVoiceId === String(message.id) ? '播放中…' : '语音消息' }}{{ message.duration ? ` · ${message.duration} 秒` : '' }}</text><text v-else>{{ messageText(message) }}</text></view>
        <text v-if="uncertainRecalls.includes(String(message.id))" class="delivery retry" @click="retryHistory">撤回结果待核对，点击刷新消息</text>
        <text v-else-if="recallingId === String(message.id)" class="delivery">撤回处理中…</text>
        <text v-else-if="canRecall(message)" class="recall" @click="recallMessage(message)">撤回</text>
        <text v-if="message.pending" class="delivery">发送中</text>
        <text v-else-if="message.failed" class="delivery retry" @click="retryMessage(message)">发送失败，点击重试</text>
        <text v-else-if="readText(message)" class="delivery">{{ readText(message) }}</text>
      </view>
      <view v-if="!messages.length && !historyLoadFailed" class="empty">暂无历史消息</view>
    </scroll-view>
    <view v-if="hasNewMessages" class="realtime-notice" @click="showLatestMessages">有新消息，点击查看</view>
    <view class="composer">
      <view class="image-picker" :class="{ disabled: sending }" @click="sendImage">图片</view>
      <view class="voice-picker" :class="{ recording: voiceRecording, disabled: sending }" @touchstart="startVoice" @touchend="stopVoice" @touchcancel="discardVoice">{{ voiceRecording ? '松开发送' : '按住说话' }}</view>
      <input v-model="inputText" class="input" placeholder="输入消息" :disabled="sending" confirm-type="send" @confirm="sendText()" />
      <view class="send" :class="{ disabled: !inputText.trim() || sending }" @click="sendText()">{{ sending ? '发送中' : '发送' }}</view>
    </view>
  </view>
  <EmptyState v-else-if="loadFailed" title="订单群加载失败" description="请重新加载会话与消息" action-text="重新加载" @action="initialize" />
  <EmptyState v-else-if="currentOrderId && !userStore.currentUser" title="请先登录查看订单群" description="当前尚未读取账号消息" action-text="登录或重试" @action="initialize" />
  <EmptyState v-else-if="currentOrderId" title="订单群尚未加载" action-text="重新加载" @action="initialize" />
  <EmptyState v-else title="缺少订单信息" description="请从订单或会话列表进入" />
</template>

<style lang="scss" scoped>
.page { height: 100%; display: flex; flex-direction: column; background: var(--yb-bg); }
.state-loading { padding: 120rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
.header { padding: 20rpx 32rpx; background: #fff; border-bottom: 1rpx solid var(--yb-border); }.title,.meta,.sender { display:block; }.title{font-size:30rpx;font-weight:600}.meta,.sender{font-size:22rpx;color:#86909c;margin-top:4rpx}.messages{flex:1;width:100%;min-width:0;min-height:0;padding:20rpx 24rpx;box-sizing:border-box;overflow-x:hidden}.row{display:flex;width:100%;min-width:0;flex-direction:column;margin-bottom:20rpx}.row.right{align-items:flex-end}.row.center{align-items:center}.bubble{max-width:75%;padding:16rpx 20rpx;box-sizing:border-box;border-radius:var(--yb-radius-md);background:#fff;color:#1d2129;font-size:26rpx;overflow-wrap:anywhere;word-break:break-word;border:1rpx solid var(--yb-border)}.bubble.right{background:var(--yb-brand);border-color:var(--yb-brand);color:#fff}.bubble.center{background:#f1f1ee;color:#717784;font-size:22rpx}.empty{text-align:center;color:#86909c;padding:60rpx 0}
.realtime-notice{display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding:12rpx 32rpx;background:#fff6e8;color:#a85a00;font-size:22rpx}.retry{color:var(--yb-brand)}.delivery,.recall{font-size:20rpx;color:#86909c;margin-top:4rpx}.recall{color:var(--yb-brand)}.message-image{display:block;max-width:100%;border-radius:12rpx}.voice-message{display:block;min-width:150rpx}.composer{display:flex;width:100%;min-width:0;align-items:center;gap:12rpx;padding:16rpx 24rpx;padding-bottom:calc(16rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:#fff;border-top:1rpx solid var(--yb-border)}.image-picker,.voice-picker{display:flex;flex-shrink:0;align-items:center;justify-content:center;min-width:80rpx;min-height:80rpx;color:var(--yb-brand);font-size:24rpx}.image-picker.disabled,.voice-picker.disabled{color:#c9cdd4}.voice-picker.recording{color:#d4380d}.input{flex:1;min-width:0;height:80rpx;padding:0 24rpx;box-sizing:border-box;border-radius:40rpx;background:#f2f2ef;font-size:26rpx}.send{display:flex;flex-shrink:0;align-items:center;justify-content:center;min-height:80rpx;padding:0 28rpx;border-radius:40rpx;background:var(--yb-brand);color:#fff;font-size:26rpx;font-weight:600}.send.disabled{background:#c9cdd4}
</style>
