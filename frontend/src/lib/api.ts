const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : res.statusText;
    throw new Error(message || 'API request failed');
  }

  return res.json();
}

// Channels
export interface Channel {
  id: string;
  type: string;
  pageId: string;
  pageName: string;
  status: string;
  createdAt: string;
}

export async function listChannels(): Promise<Channel[]> {
  return apiFetch<Channel[]>('/channels');
}

export async function getFacebookPageInfo(
  pageAccessToken: string,
): Promise<{ pageId: string; pageName: string; picture?: string }> {
  return apiFetch<{ pageId: string; pageName: string; picture?: string }>(
    '/channels/facebook-page-info',
    {
      method: 'POST',
      body: JSON.stringify({ pageAccessToken }),
    },
  );
}

export async function connectChannel(data: {
  type: 'facebook' | 'instagram';
  pageId?: string;
  pageName?: string;
  pageAccessToken: string;
  instagramAccountId?: string;
}): Promise<Channel> {
  return apiFetch<Channel>('/channels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function disconnectChannel(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/channels/${id}`, { method: 'DELETE' });
}

// Conversations
export interface Conversation {
  id: string;
  channelId: string;
  externalId: string | null;
  participantId: string;
  participantName: string | null;
  participantProfilePic?: string | null;
  lastMessageAt: string;
  channel: { id: string; type: string; pageName: string };
  messages?: { content: string; direction: string }[];
}

export async function listConversations(channelId?: string): Promise<Conversation[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  return apiFetch<Conversation[]>(`/conversations${qs}`);
}

export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${id}`);
}

export interface Message {
  id: string;
  conversationId: string;
  direction: string;
  content: string;
  attachments: unknown;
  createdAt: string;
}

export interface MessagesResponse {
  data: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getMessages(
  conversationId: string,
  limit?: number,
  cursor?: string
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<MessagesResponse>(`/conversations/${conversationId}/messages${qs}`);
}

export async function replyToConversation(
  conversationId: string,
  text: string
): Promise<Message> {
  return apiFetch<Message>(`/conversations/${conversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
