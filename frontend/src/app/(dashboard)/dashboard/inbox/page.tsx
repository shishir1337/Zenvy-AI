'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  listChannels,
  connectChannel,
  disconnectChannel,
  listConversations,
  getConversation,
  getMessages,
  replyToConversation,
  getFacebookPageInfo,
  type Channel,
  type Conversation,
  type Message,
} from '@/lib/api';
import { useInboxEvents } from '@/hooks/use-inbox-events';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

function getInitials(nameOrId: string): string {
  const trimmed = nameOrId.trim();
  if (!trimmed) return '?';
  if (/^\d+$/.test(trimmed)) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0][0] ?? '';
    const last = parts[parts.length - 1][0] ?? '';
    return (first + last).toUpperCase().slice(0, 2);
  }
  return trimmed.slice(0, 2).toUpperCase();
}

type Attachment = { type?: string; payload?: { url?: string } };

function parseAttachments(attachments: unknown): Attachment[] {
  if (!attachments) return [];
  if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(attachments)) return attachments as Attachment[];
  return [];
}

function MessageContent({ msg }: { msg: Message }) {
  const attachments = parseAttachments(msg.attachments);
  const imageAttachments = attachments.filter((a) => (a.type ?? 'file') === 'image');
  const imageUrls = imageAttachments
    .map((a) => a.payload?.url)
    .filter((u): u is string => !!u);
  const isLabel = /^\[.*\]$/.test(msg.content || '');
  const hasText = msg.content && !isLabel;

  return (
    <div className="space-y-2">
      {hasText && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-w-[280px]">
          {imageUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="max-w-[120px] max-h-[120px] w-full h-auto object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {!hasText && imageUrls.length === 0 && (
        <p className="whitespace-pre-wrap break-words">{msg.content || '(no content)'}</p>
      )}
    </div>
  );
}

export default function InboxPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectForm, setConnectForm] = useState({
    type: 'facebook' as 'facebook' | 'instagram',
    pageId: '',
    pageName: '',
    pageAccessToken: '',
  });
  const [connectError, setConnectError] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<Channel | null>(null);

  const refreshChannels = useCallback(async () => {
    try {
      const data = await listChannels();
      setChannels(data);
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const data = await listConversations(selectedChannelId ?? undefined);
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setConversationsLoading(false);
    }
  }, [selectedChannelId]);

  const refreshMessages = useCallback(async () => {
    if (!selectedConversation) return;
    setMessagesLoading(true);
    try {
      const res = await getMessages(selectedConversation.id);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedConversation]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await refreshChannels();
      setLoading(false);
    };
    load();
  }, [refreshChannels]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    refreshMessages();
  }, [refreshMessages]);

  useInboxEvents((event) => {
    refreshConversations();
    if (selectedConversation && event.conversationId === selectedConversation.id) {
      refreshMessages();
    }
  });

  const handleVerifyToken = async () => {
    const token = connectForm.pageAccessToken.trim();
    if (!token || token.length < 10) return;
    setConnectError('');
    setVerifyLoading(true);
    try {
      const info = await getFacebookPageInfo(token);
      setConnectForm((f) => ({
        ...f,
        pageId: info.pageId,
        pageName: info.pageName,
      }));
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Invalid token');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError('');
    setConnectLoading(true);
    try {
      await connectChannel({
        type: connectForm.type,
        pageAccessToken: connectForm.pageAccessToken.trim(),
        ...(connectForm.type === 'instagram' && {
          pageId: connectForm.pageId.trim(),
          pageName: connectForm.pageName.trim(),
        }),
      });
      setConnectOpen(false);
      setConnectForm({ type: 'facebook', pageId: '', pageName: '', pageAccessToken: '' });
      await refreshChannels();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnectClick = (ch: Channel) => {
    setDisconnectTarget(ch);
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setSelectedConversation(conv);
    if (conv.participantName) return;
    try {
      const fresh = await getConversation(conv.id);
      setSelectedConversation((prev) =>
        prev?.id === fresh.id ? { ...prev, ...fresh } : prev
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c))
      );
    } catch {
      // ignore
    }
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    const id = disconnectTarget.id;
    setDisconnectTarget(null);
    try {
      await disconnectChannel(id);
      if (selectedChannelId === id) setSelectedChannelId(null);
      await refreshChannels();
      await refreshConversations();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !replyText.trim()) return;
    setSending(true);
    setReplyError(null);
    try {
      const msg = await replyToConversation(selectedConversation.id, replyText.trim());
      setMessages((prev) => [...prev, msg]);
      setReplyText('');
      setReplyError(null);
      await refreshConversations();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          {channels.length > 0 && (
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Connect Channel
            </Button>
          )}
          <DialogContent>
            <form onSubmit={handleConnect}>
              <DialogHeader>
                <DialogTitle>Connect Facebook Page</DialogTitle>
                <DialogDescription>
                  {connectForm.type === 'facebook'
                    ? 'Paste your Page access token from Meta for Developers. We will fetch the Page ID and name automatically.'
                    : 'For Instagram DM, provide your Instagram Business Account ID and name from Meta for Developers.'}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="type">Channel type</Label>
                  <select
                    id="type"
                    className="mt-1 flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
                    value={connectForm.type}
                    onChange={(e) =>
                      setConnectForm((f) => ({ ...f, type: e.target.value as 'facebook' | 'instagram' }))
                    }
                  >
                    <option value="facebook">Facebook Messenger</option>
                    <option value="instagram">Instagram DM</option>
                  </select>
                </div>
                {connectForm.type === 'instagram' && (
                  <>
                    <div>
                      <Label htmlFor="pageId">Page ID</Label>
                      <Input
                        id="pageId"
                        placeholder="123456789012345"
                        value={connectForm.pageId}
                        onChange={(e) =>
                          setConnectForm((f) => ({ ...f, pageId: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="pageName">Page name</Label>
                      <Input
                        id="pageName"
                        placeholder="My Page"
                        value={connectForm.pageName}
                        onChange={(e) =>
                          setConnectForm((f) => ({ ...f, pageName: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor="token">Page access token</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="token"
                      type="password"
                      placeholder="EAAxxxx..."
                      value={connectForm.pageAccessToken}
                      onChange={(e) =>
                        setConnectForm((f) => ({ ...f, pageAccessToken: e.target.value }))
                      }
                      required
                      minLength={10}
                      className="flex-1"
                    />
                    {connectForm.type === 'facebook' && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVerifyToken}
                        disabled={verifyLoading || connectForm.pageAccessToken.length < 10}
                      >
                        {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                      </Button>
                    )}
                  </div>
                  {connectForm.type === 'facebook' && connectForm.pageName && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Page: {connectForm.pageName} (ID: {connectForm.pageId})
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {connectForm.type === 'facebook'
                      ? 'Get this from Meta for Developers → Your App → Messenger → Settings → Page Access Token'
                      : 'Get this from Meta for Developers → Your App → Instagram → Settings'}
                  </p>
                </div>
                {connectError && (
                  <p className="text-sm text-destructive">{connectError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConnectOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={connectLoading}>
                  {connectLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Connect
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={!!disconnectTarget} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect channel</DialogTitle>
              <DialogDescription>
                Disconnect {disconnectTarget?.pageName}? Messages will stop syncing.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisconnectTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDisconnectConfirm}>
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {channels.length === 0 ? (
        <Card className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h3 className="font-semibold">No channels connected</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a Facebook Page to receive and reply to messages.
            </p>
          </div>
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Connect Channel
          </Button>
        </Card>
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* Channels sidebar */}
          <div className="flex w-48 shrink-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Channels</p>
            <div className="flex flex-col gap-1 overflow-y-auto">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="group flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <button
                    type="button"
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 text-left text-sm',
                      selectedChannelId === ch.id
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setSelectedChannelId(selectedChannelId === ch.id ? null : ch.id)}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{ch.pageName}</span>
                  </button>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-destructive/10 text-destructive"
                    onClick={() => handleDisconnectClick(ch)}
                    title="Disconnect"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Conversations list */}
          <div className="flex w-72 shrink-0 flex-col gap-2 overflow-hidden rounded-lg border">
            <div className="border-b px-3 py-2">
              <p className="text-sm font-medium">Conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50',
                      selectedConversation?.id === conv.id && 'bg-muted'
                    )}
                    onClick={() => handleSelectConversation(conv)}
                  >
                    <Avatar size="sm" className="shrink-0">
                      {conv.participantProfilePic ? (
                        <AvatarImage
                          src={conv.participantProfilePic}
                          alt=""
                        />
                      ) : null}
                      <AvatarFallback>
                        {getInitials(
                          conv.participantName || conv.participantId
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="truncate font-medium">
                        {conv.participantName || conv.participantId}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {conv.messages?.[0]?.content ?? 'No messages'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message thread */}
          <div className="flex flex-1 flex-col min-w-0 rounded-lg border">
            {selectedConversation ? (
              <>
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <Avatar size="lg" className="shrink-0">
                    {selectedConversation.participantProfilePic ? (
                      <AvatarImage
                        src={selectedConversation.participantProfilePic}
                        alt=""
                      />
                    ) : null}
                    <AvatarFallback>
                      {getInitials(
                        selectedConversation.participantName ||
                          selectedConversation.participantId
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {selectedConversation.participantName ||
                        selectedConversation.participantId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversation.channel.pageName}
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !messagesLoading && messages.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      No messages yet
                    </div>
                  ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        msg.direction === 'outbound'
                          ? 'ml-auto bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <MessageContent msg={msg} />
                    </div>
                  ))
                  )}
                </div>
                <form
                  onSubmit={handleReply}
                  className="flex gap-2 border-t p-3"
                >
                  <Input
                    placeholder="Type a message..."
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      if (replyError) setReplyError(null);
                    }}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={sending || !replyText.trim()}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
                {replyError && (
                  <p className="px-3 pb-2 text-sm text-destructive">{replyError}</p>
                )}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageSquare className="h-12 w-12" />
                <p className="text-sm">Select a conversation</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
