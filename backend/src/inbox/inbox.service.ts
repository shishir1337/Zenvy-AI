import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelService } from '../channel/channel.service';
import { InboxEventService } from './inbox-event.service';
import type { UpdateConversationDto } from './dto/update-conversation.dto';

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
    private readonly inboxEventService: InboxEventService,
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

  async updateConversation(
    organizationId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
      include: { channel: { select: { id: true } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const data: { unread?: boolean; status?: string; notes?: string } = {};
    if (dto.unread !== undefined) data.unread = dto.unread;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      include: {
        channel: {
          select: { id: true, type: true, pageName: true, pageId: true },
        },
      },
    });

    this.inboxEventService.emitConversationUpdated(organizationId, {
      conversationId,
      channelId: conv.channelId,
    });

    return updated;
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

  async getLabelsForConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<{ id: string; page_label_name: string }[]> {
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
    if (!channelWithToken) return [];

    return this.channelService.getLabelsForUser(
      conv.participantId,
      channelWithToken.pageAccessToken,
    );
  }

  async listAvailableLabels(
    organizationId: string,
    conversationId: string,
  ): Promise<{ id: string; page_label_name: string }[]> {
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
    if (!channelWithToken) return [];

    return this.channelService.listCustomLabels(
      conv.channel.pageId,
      channelWithToken.pageAccessToken,
    );
  }

  async assignLabel(
    organizationId: string,
    conversationId: string,
    dto: { labelId?: string; labelName?: string },
  ): Promise<{ success: boolean }> {
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
    if (!channelWithToken)
      throw new ForbiddenException('Channel not found');

    let labelId = dto.labelId;
    if (!labelId && dto.labelName) {
      const created = await this.channelService.createCustomLabel(
        conv.channel.pageId,
        channelWithToken.pageAccessToken,
        dto.labelName,
      );
      labelId = created?.id ?? undefined;
    }
    if (!labelId) throw new ForbiddenException('labelId or labelName required');

    const ok = await this.channelService.assignLabelToUser(
      labelId,
      conv.participantId,
      channelWithToken.pageAccessToken,
    );
    return { success: ok };
  }

  async removeLabel(
    organizationId: string,
    conversationId: string,
    labelId: string,
  ): Promise<{ success: boolean }> {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const channelWithToken = await this.channelService.getChannelWithToken(
      conv.channelId,
      organizationId,
    );
    if (!channelWithToken)
      throw new ForbiddenException('Channel not found');

    const ok = await this.channelService.removeLabelFromUser(
      labelId,
      conv.participantId,
      channelWithToken.pageAccessToken,
    );
    return { success: ok };
  }

  async getAttachments(
    organizationId: string,
    conversationId: string,
  ): Promise<{ type: string; url: string }[]> {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: { attachments: true },
    });

    const result: { type: string; url: string }[] = [];
    for (const msg of messages) {
      if (!msg.attachments) continue;
      let arr: Array<{ type?: string; payload?: { url?: string } }>;
      try {
        const parsed = JSON.parse(msg.attachments) as unknown;
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        continue;
      }
      for (const a of arr) {
        const url = a.payload?.url;
        if (url) {
          result.push({ type: a.type ?? 'file', url });
        }
      }
    }
    return result;
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

  async uploadAttachment(
    organizationId: string,
    conversationId: string,
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
  ): Promise<{ attachmentId: string; type: string } | null> {
    if (!file?.buffer) return null;
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

    const result = await this.channelService.uploadAttachment(
      conv.channel.pageId,
      channelWithToken.pageAccessToken,
      {
        buffer: file.buffer,
        mimetype: file.mimetype ?? 'application/octet-stream',
        originalname: file.originalname,
      },
    );
    return result;
  }

  async reply(
    organizationId: string,
    conversationId: string,
    dto: { text?: string; attachmentId?: string; attachmentType?: string },
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        channel: { organizationId },
      },
      include: { channel: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    if (!dto.text && !dto.attachmentId) {
      throw new ForbiddenException('text or attachmentId required');
    }

    const channelWithToken = await this.channelService.getChannelWithToken(
      conv.channelId,
      organizationId,
    );
    if (!channelWithToken) throw new ForbiddenException('Channel not found');

    const url = new URL(
      this.getGraphApiUrl(`/${conv.channel.pageId}/messages`),
    );
    url.searchParams.set('access_token', channelWithToken.pageAccessToken);

    let messagePayload: { text?: string; attachment?: { type: string; payload: { attachment_id: string } } };
    if (dto.attachmentId) {
      const attachmentType = dto.attachmentType ?? 'file';
      messagePayload = {
        attachment: {
          type: attachmentType,
          payload: { attachment_id: dto.attachmentId },
        },
      };
    } else {
      messagePayload = { text: dto.text! };
    }

    const res = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: conv.participantId },
        messaging_type: 'RESPONSE',
        message: messagePayload,
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

    const content = dto.text ?? (dto.attachmentId ? '[Attachment]' : '');
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        externalId: data.message_id ?? null,
        direction: 'outbound',
        content,
      },
    });

    return message;
  }
}
