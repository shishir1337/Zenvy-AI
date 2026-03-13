import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelService } from '../channel/channel.service';
import { InboxEventService } from '../inbox/inbox-event.service';

const CONVERSATION_ID_PREFIX = 't_';

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelService: ChannelService,
    private readonly inboxEventService: InboxEventService,
  ) {}

  async processWebhook(body: {
    object?: string;
    entry?: Array<{
      id: string;
      time?: number;
      messaging?: Array<{
        sender: { id: string };
        recipient: { id: string };
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
          attachments?: Array<{ type?: string; payload?: { url?: string } }>;
        };
      }>;
    }>;
  }) {
    const entries = body.entry || [];
    for (const entry of entries) {
      const pageId = entry.id;
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (event.message && event.message.is_echo !== true) {
          const { content, attachmentsJson } = this.deriveMessageContent(
            event.message.text,
            event.message.attachments,
          );
          await this.handleMessage(
            pageId,
            event.sender.id,
            event.recipient.id,
            event.message.mid,
            content,
            attachmentsJson,
          );
        }
      }
    }
  }

  private deriveMessageContent(
    text: string | undefined,
    attachments?: Array<{ type?: string; payload?: { url?: string } }>,
  ): { content: string; attachmentsJson: string | null } {
    if (text) {
      return { content: text, attachmentsJson: null };
    }
    if (attachments?.length) {
      const imageCount = attachments.filter(
        (a) => (a.type ?? 'file') === 'image',
      ).length;
      const videoCount = attachments.filter(
        (a) => (a.type ?? 'file') === 'video',
      ).length;
      const audioCount = attachments.filter(
        (a) => (a.type ?? 'file') === 'audio',
      ).length;
      const fileCount = attachments.filter(
        (a) => (a.type ?? 'file') === 'file',
      ).length;

      let label: string;
      if (imageCount > 1) {
        label = `[${imageCount} images]`;
      } else if (imageCount === 1) {
        label = '[Image]';
      } else if (videoCount > 1) {
        label = `[${videoCount} videos]`;
      } else if (videoCount === 1) {
        label = '[Video]';
      } else if (audioCount > 1) {
        label = `[${audioCount} audio]`;
      } else if (audioCount === 1) {
        label = '[Audio]';
      } else if (fileCount > 1) {
        label = `[${fileCount} files]`;
      } else if (fileCount === 1) {
        label = '[File]';
      } else {
        const first = attachments[0];
        const type = first.type ?? 'file';
        label = `[${type}]`;
      }

      return {
        content: label,
        attachmentsJson: JSON.stringify(attachments),
      };
    }
    return { content: '', attachmentsJson: null };
  }

  private async handleMessage(
    pageId: string,
    senderId: string,
    recipientId: string,
    messageId: string | undefined,
    content: string,
    attachmentsJson: string | null,
  ) {
    const channel = await this.channelService.findChannelByPageId(pageId);
    if (!channel) return;

    const externalId = `${CONVERSATION_ID_PREFIX}${senderId}`;
    const conversation = await this.prisma.conversation.upsert({
      where: {
        channelId_externalId: {
          channelId: channel.id,
          externalId,
        },
      },
      create: {
        channelId: channel.id,
        externalId,
        participantId: senderId,
        participantName: null,
      },
      update: { lastMessageAt: new Date() },
    });

    if (conversation.participantName === null) {
      const profile = await this.channelService.getUserProfile(
        senderId,
        channel.pageAccessToken,
      );
      if (profile?.name || profile?.profile_pic) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            ...(profile.name && { participantName: profile.name }),
            ...(profile.profile_pic && {
              participantProfilePic: profile.profile_pic,
            }),
          },
        });
      }
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        externalId: messageId ?? null,
        direction: 'inbound',
        content: content || '(no content)',
        attachments: attachmentsJson,
      },
    });

    this.inboxEventService.emitNewMessage(channel.organizationId, {
      conversationId: conversation.id,
      channelId: channel.id,
    });
  }
}
