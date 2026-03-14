'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const INITIAL_RECONNECT_MS = 3000;
const MAX_RECONNECT_MS = 30000;

export interface InboxEvent {
  type: 'new_message' | 'new_conversation' | 'conversation_updated';
  conversationId: string;
  channelId: string;
}

export function useInboxEvents(onEvent: (event: InboxEvent) => void) {
  const onEventRef = useRef(onEvent);
  const intentionalAbortRef = useRef(false);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_MS);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const url = `${API_URL}/api/inbox/events`;
    const controller = new AbortController();

    const scheduleReconnect = () => {
      if (intentionalAbortRef.current) return;
      timeoutIdRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_MS,
        );
        connect();
      }, reconnectDelayRef.current);
    };

    const connect = async () => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
          headers: { Accept: 'text/event-stream' },
        });

        if (!res.ok || !res.body) {
          scheduleReconnect();
          return;
        }

        reconnectDelayRef.current = INITIAL_RECONNECT_MS;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const block of lines) {
            const dataMatch = block.match(/^data:\s*(.+)$/m);
            if (dataMatch) {
              try {
                const event = JSON.parse(dataMatch[1]) as InboxEvent;
                onEventRef.current(event);
              } catch {
                // ignore parse errors
              }
            }
          }
        }
        scheduleReconnect();
      } catch (err) {
        if (!intentionalAbortRef.current && (err as Error).name !== 'AbortError') {
          scheduleReconnect();
        }
      }
    };

    connect();
    return () => {
      intentionalAbortRef.current = true;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      controller.abort();
    };
  }, []);
}
