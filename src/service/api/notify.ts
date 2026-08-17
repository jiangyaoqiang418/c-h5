import { realNotifyRequest } from '../request';

export function fetchNotifications(query: Api.RealNotify.NotificationPageQuery = {}) {
  return realNotifyRequest<Api.RealNotify.Page<Api.RealNotify.Notification>, Api.RealNotify.NotificationPageQuery>({
    url: '/notifications/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, unreadOnly: query.unreadOnly }
  });
}

export function fetchNotificationUnreadCount() { return realNotifyRequest<number>({ url: '/notifications/unread/count' }); }
export function markNotificationRead(id: Api.RealNotify.Id) { return realNotifyRequest<boolean, { id: Api.RealNotify.Id }>({ url: '/notifications/read', method: 'PUT', data: { id } }); }

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

export function sendMessage(params: Api.RealNotify.SendMessageParams) {
  return realNotifyRequest<Api.RealNotify.Message, Api.RealNotify.SendMessageParams>({ url: '/im/messages/send', method: 'POST', data: params });
}

export function fetchImUnreadCount() { return realNotifyRequest<number>({ url: '/im/unread/count' }); }
export function fetchImLinkStatus() { return realNotifyRequest<Api.RealNotify.ImLinkStatusVO>({ url: '/back/im/status', requireToken: false }); }
