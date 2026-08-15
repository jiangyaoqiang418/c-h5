declare namespace Api {
  namespace RealNotify {
    type Id = string | number;
    type ImMessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'ORDER_CARD' | 'SYSTEM';

    interface Page<T> {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: T[];
    }

    interface Notification {
      id: Id;
      channel?: string;
      templateCode?: string;
      title?: string;
      content?: string;
      bizType?: string;
      bizId?: Id;
      readFlag?: boolean;
      createdAt?: string | number;
    }

    interface Conversation {
      id: Id;
      title?: string;
      bizType?: string;
      bizId?: Id;
      myRole?: 'CUSTOMER' | 'SELLER' | 'ADMIN';
      lastMessageAt?: string | number;
      lastMessagePreview?: string;
      lastReadMessageId?: Id;
      unreadCount?: number;
      peerName?: string;
      peerAvatar?: string;
      orderNo?: string;
      orderStatus?: string;
      orderStatusText?: string;
      productTitle?: string;
      productImage?: string;
      amount?: number;
    }

    interface Message {
      id: Id;
      conversationId: Id;
      senderId?: Id;
      senderRole?: 'CUSTOMER' | 'SELLER' | 'ADMIN';
      senderName?: string;
      senderAvatar?: string;
      msgType: ImMessageType;
      content?: string;
      mediaUrl?: string;
      duration?: number;
      eventType?: string;
      params?: Record<string, unknown>;
      clientMsgId?: string;
      recalled?: boolean;
      createdAt?: string | number;
    }

    interface NotificationPageQuery { pageNo?: number; pageSize?: number; unreadOnly?: boolean; }
    interface ConversationPageQuery { pageNo?: number; pageSize?: number; }
    interface MessagePageQuery { pageNo?: number; pageSize?: number; conversationId: Id; }
    interface SendMessageParams { conversationId: Id; msgType: ImMessageType; content?: string; mediaUrl?: string; duration?: number; clientMsgId?: string; }
  }
}
