import { realNotifyRequest, realNotifyUpload } from '../request';

export function fetchNotifications(query: Api.RealNotify.NotificationPageQuery = {}) {
  return realNotifyRequest<Api.RealNotify.Page<Api.RealNotify.Notification>, Api.RealNotify.NotificationPageQuery>({
    url: '/notifications/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, unreadOnly: query.unreadOnly }
  });
}

export function fetchNotificationUnreadCount() { return realNotifyRequest<number>({ url: '/notifications/unread/count' }); }

export function isTransactionNotification(notification: Api.RealNotify.Notification): boolean {
  return /RECHARGE|WITHDRAW|WALLET|FUND|FINANCE|ORDER/.test(`${notification.bizType || ''} ${notification.templateCode || ''}`.toUpperCase());
}

export async function fetchUnreadNotifications(): Promise<Api.RealNotify.Notification[]> {
  const records = new Map<string, Api.RealNotify.Notification>();
  for (let pageNo = 1; ; pageNo++) {
    const page = await fetchNotifications({ pageNo, pageSize: 50, unreadOnly: true });
    if (!Number.isFinite(Number(page.total))) throw new Error('未读通知总数无效');
    page.records.forEach(item => records.set(String(item.id), item));
    if (pageNo * 50 >= Number(page.total)) return [...records.values()];
    if (!page.records.length) throw new Error('未读通知分页不完整，请重试');
  }
}
export function markNotificationRead(id: Api.RealNotify.Id) { return realNotifyRequest<boolean, { id: Api.RealNotify.Id }>({ url: '/notifications/read', method: 'PUT', data: { id } }); }
export function markAllNotificationsRead() { return realNotifyRequest<boolean>({ url: '/notifications/read-all', method: 'PUT' }); }
export function deleteNotification(id: Api.RealNotify.Id) { return realNotifyRequest<boolean>({ url: '/notifications/delete', method: 'DELETE', params: { id } }); }
export function clearNotifications() { return realNotifyRequest<boolean>({ url: '/notifications/clear', method: 'DELETE' }); }

export function fetchConversations(query: Api.RealNotify.ConversationPageQuery = {}) {
  return realNotifyRequest<Api.RealNotify.Page<Api.RealNotify.Conversation>, Api.RealNotify.ConversationPageQuery>({
    url: '/im/conversations/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20 }
  });
}

export function fetchConversationByOrder(orderId: Api.RealNotify.Id) {
  return realNotifyRequest<Api.RealNotify.Conversation>({ url: '/im/conversations/by-order', params: { orderId } });
}

export function fetchMessages(query: Api.RealNotify.MessagePageQuery) {
  return realNotifyRequest<Api.RealNotify.Page<Api.RealNotify.Message>, Api.RealNotify.MessagePageQuery>({
    url: '/im/messages/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 30, conversationId: query.conversationId }
  });
}

export function fetchIncrementalMessages(query: Api.RealNotify.IncrementalMessageQuery) {
  return realNotifyRequest<Api.RealNotify.Message[], Api.RealNotify.IncrementalMessageQuery>({
    url: '/im/messages/incr', params: { conversationId: query.conversationId, sinceId: query.sinceId, limit: query.limit || 500 }
  });
}

export function sendMessage(params: Api.RealNotify.SendMessageParams) {
  return realNotifyRequest<Api.RealNotify.Message, Api.RealNotify.SendMessageParams>({ url: '/im/messages/send', method: 'POST', data: params });
}

export function markImMessagesRead(params: Api.RealNotify.ImReadParams) {
  return realNotifyRequest<boolean, Api.RealNotify.ImReadParams>({ url: '/im/messages/read', method: 'PUT', data: params });
}

export function recallImMessage(params: Api.RealNotify.ImRecallParams) {
  return realNotifyRequest<boolean, Api.RealNotify.ImRecallParams>({ url: '/im/messages/recall', method: 'PUT', data: params });
}

export function fetchImUnreadCount() { return realNotifyRequest<number>({ url: '/im/unread/count' }); }
export function fetchImLinkStatus() { return realNotifyRequest<Api.RealNotify.ImLinkStatusVO>({ url: '/back/im/status', requireToken: false }); }

export function uploadImImage(filePath: string, conversationId?: Api.RealNotify.Id) {
  return realNotifyUpload<Api.RealNotify.MediaUploadResult>({ url: '/im/files/upload', filePath, name: 'file', params: { scene: 'IM_IMAGE', conversationId } });
}

export function uploadImVoice(filePath: string, duration: number, conversationId?: Api.RealNotify.Id) {
  return realNotifyUpload<Api.RealNotify.MediaUploadResult>({ url: '/im/files/upload', filePath, name: 'file', params: { scene: 'IM_VOICE', duration, conversationId } });
}
