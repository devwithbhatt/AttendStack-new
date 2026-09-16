'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchConversations, Conversation } from '../../helper/chatApi';
import {
  registerChatServiceWorker,
  sendBrowserChatNotification,
  updateTabTitleBadge,
  clearTabTitleBadge,
  initNotifiedMessages,
  markMessageAsNotified,
  hasMessageBeenNotified,
} from '../../helper/browserNotification';
import { preloadNotificationSound } from '../../helper/notificationSound';

export const GlobalChatNotificationListener: React.FC = () => {
  const pathname = usePathname();
  const prevConversationsRef = useRef<Record<string, { lastMsgId?: string; unread: number }>>({});
  const initialSeededRef = useRef<boolean>(false);
  const sessionStartTimeRef = useRef<number>(Date.now());

  // Current logged in user ID
  const getCurrentUserId = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        return u?.id ? String(u.id) : null;
      }
    } catch (_) {}
    return null;
  };

  // Initialize service worker & preload audio on mount
  useEffect(() => {
    registerChatServiceWorker();
    preloadNotificationSound();
  }, []);

  // Poll conversations every 12 seconds in background to detect incoming messages
  const { data: conversations = [], isSuccess } = useQuery<Conversation[]>({
    queryKey: ['global_conversations_notifications'],
    queryFn: fetchConversations,
    refetchInterval: 12000,
    refetchIntervalInBackground: true,
    staleTime: 5000,
  });

  // Monitor unread and new messages
  useEffect(() => {
    if (!conversations || !Array.isArray(conversations)) return;

    const currentUserId = getCurrentUserId();
    let totalUnread = 0;
    const currentMap: Record<string, { lastMsgId?: string; unread: number }> = {};

    conversations.forEach((conv) => {
      totalUnread += conv.unread_count || 0;
      currentMap[conv.id] = {
        lastMsgId: conv.last_message?.id,
        unread: conv.unread_count || 0,
      };
    });

    // 1. On FIRST data fetch / login, seed all existing messages into permanent registry so old/seen messages NEVER trigger notifications
    if (!initialSeededRef.current) {
      if (conversations.length > 0 || isSuccess) {
        const existingMsgIds = conversations
          .map((c) => c.last_message?.id)
          .filter(Boolean) as string[];
        initNotifiedMessages(existingMsgIds);
        prevConversationsRef.current = currentMap;
        initialSeededRef.current = true;

        if (totalUnread > 0) {
          updateTabTitleBadge(totalUnread);
        } else {
          clearTabTitleBadge();
        }
      }
      return;
    }

    // 2. Subsequent polls: only trigger for brand-new incoming messages not yet notified
    conversations.forEach((conv) => {
      const lastMsg = conv.last_message;
      if (!lastMsg || !lastMsg.id) return;

      // RULE 1: If conversation has 0 unread messages (user already saw it), NEVER notify!
      if ((conv.unread_count || 0) <= 0) {
        markMessageAsNotified(lastMsg.id);
        return;
      }

      // RULE 2: Skip if this message has already triggered a notification in this or previous sessions
      if (hasMessageBeenNotified(lastMsg.id)) return;

      // RULE 3: Skip if the message was sent by the current user
      const isFromMe = currentUserId && lastMsg.sender && String(lastMsg.sender.id) === currentUserId;
      if (isFromMe) {
        markMessageAsNotified(lastMsg.id);
        return;
      }

      const prev = prevConversationsRef.current[conv.id];
      // A new message arrived if the previous recorded lastMsgId changed or this is a fresh unread conversation
      const isNewMessageArrival = prev ? prev.lastMsgId !== lastMsg.id : true;

      // RULE 4: Message created_at must not be older than the session start time (avoid stale offline notifications on reconnect)
      if (lastMsg.created_at) {
        const msgTime = new Date(lastMsg.created_at).getTime();
        if (msgTime < sessionStartTimeRef.current - 10000) {
          markMessageAsNotified(lastMsg.id);
          return;
        }
      }

      // Check if user is away from chat OR tab is in background
      const isDocumentHidden = typeof document !== 'undefined' && document.hidden;
      const isAwayFromChat = pathname !== '/chat';

      if (isNewMessageArrival && (isAwayFromChat || isDocumentHidden)) {
        const senderName =
          lastMsg.sender?.name ||
          lastMsg.sender?.email ||
          conv.display_name ||
          'Team Member';

        const bodyText =
          lastMsg.content ||
          (lastMsg.attachments?.length
            ? `[${lastMsg.attachments.length} attachment(s)]`
            : 'Sent a message');

        sendBrowserChatNotification({
          messageId: lastMsg.id,
          title: `${senderName} (${conv.display_name})`,
          body: bodyText,
          conversationId: conv.id,
          avatar: conv.avatar || conv.other_user?.avatar || lastMsg.sender?.avatar || lastMsg.sender?.profile_photo_url,
          playSound: true,
        });
      }
    });

    // Update unread title badge
    if (totalUnread > 0) {
      updateTabTitleBadge(totalUnread);
    } else {
      clearTabTitleBadge();
    }

    prevConversationsRef.current = currentMap;
  }, [conversations, isSuccess, pathname]);

  return null; // Headless component
};

export default GlobalChatNotificationListener;
