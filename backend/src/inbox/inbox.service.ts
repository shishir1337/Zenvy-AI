import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelService } from '../channel/channel.service';

type EnrichedConversation = {
  id: string;
  participantName: string | null;
  participantProfilePic: string | null;
};

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelService: ChannelService,
    private readonly config: ConfigService,
  ) {}

  private getGraphApiUrl(path: string): string {
    const base =
      this.config.get<string>('facebook.graphApiBase') ||
      'https://graph.facebook.com';
    const version =
      this.config.get<string>('facebook.graphApiVersion') || 'v25.0';
    return `${base}/${version}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async listConversations(organizationId: string, channelId?: string) {
    const where: { channel?: { organizationId: string }; channelId?: string } =
      {
        channel: { organizationId },
      };
    if (channelId) where.channelId = channelId;

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: {
        channel: { select: { id: true, type: true, pageName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, direction: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const toEnrich = conversations
      .filter((c) => c.participantName === null)
      .slice(0, 5);
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const enrichedList = await Promise.all(
      toEnrich.map(async (c): Promise<EnrichedConversation | null> => {
        const updated = await this.enrichConversation(c, organizationId);
        if (!updated) return null;
        return {
          id: c.id,
          participantName: updated.participantName,
          participantProfilePic: updated.participantProfilePic,
        };
      }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    const enrichedMap = new Map(
      enrichedList
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map((e) => [e.id, e]),
    );

    return conversations.map((c) => {
      const enriched = enrichedMap.get(c.id);
      if (!enriched) return c;
      return { ...c, ...enriched };
    });
  }

  async getConversation(organizationId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
      include: {
        channel: {
          select: { id: true, type: true, pageName: true, pageId: true },
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    if (conv.participantName === null) {
      const enriched = await this.enrichConversation(conv, organizationId);
      if (enriched) return enriched;
    }

    return conv;
  }

  private async enrichConversation(
    conv: { id: string; participantId: string; channelId: string },
    organizationId: string,
  ) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    const channelWithToken = await this.channelService.getChannelWithToken(
      conv.channelId,
      organizationId,
    );
    if (!channelWithToken) return null;

    const profile: { name?: string; profile_pic?: string } | null =
      await this.channelService.getUserProfile(
        conv.participantId,
        channelWithToken.pageAccessToken,
      );
    const name = profile?.name;
    const profilePic = profile?.profile_pic;
    if (!name && !profilePic) return null;

    const updated = await this.prisma.conversation.update({
      where: { id: conv.id },
      data: {
        ...(name && { participantName: name }),
        ...(profilePic && { participantProfilePic: profilePic }),
      },
      include: {
        channel: {
          select: { id: true, type: true, pageName: true, pageId: true },
        },
      },
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    return updated;
  }

  async getMessages(
    organizationId: string,
    conversationId: string,
    limit = 50,
    cursor?: string,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.reverse(),
      nextCursor,
      hasMore,
    };
  }

  async reply(organizationId: string, conversationId: string, text: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
      include: { channel: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const channelWithToken = await this.channelService.getChannelWithToken(
      conv.channelId,
      organizationId,
    );
    if (!channelWithToken) throw new ForbiddenException('Channel not found');

    const url = new URL(
      this.getGraphApiUrl(`/${conv.channel.pageId}/messages`),
    );
    url.searchParams.set('access_token', channelWithToken.pageAccessToken);

    const res = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: conv.participantId },
        messaging_type: 'RESPONSE',
        message: { text },
      }),
    });

    const data = (await res.json()) as {
      message_id?: string;
      error?: { message: string };
    };
    if (data.error) {
      throw new ForbiddenException(
        data.error.message || 'Failed to send message',
      );
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        externalId: data.message_id ?? null,
        direction: 'outbound',
        content: text,
      },
    });

    return message;
  }
}
