import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { fetchWithTimeout } from '../common/fetch-with-timeout';
import { PrismaService } from '../prisma/prisma.service';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getEncryptionKey(): Buffer {
    const secret =
      this.config.get<string>('auth.secret') || process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error('Encryption secret not configured');
    return scryptSync(secret, 'zenvy-channel-salt', KEY_LENGTH);
  }

  private encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(ciphertext: string): string {
    const key = this.getEncryptionKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buf.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  private getGraphApiUrl(path: string): string {
    const base = this.config.get<string>('facebook.graphApiBase') || 'https://graph.facebook.com';
    const version = this.config.get<string>('facebook.graphApiVersion') || 'v25.0';
    return `${base}/${version}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async getUserProfile(
    psid: string,
    pageAccessToken: string,
  ): Promise<{ name?: string; profile_pic?: string } | null> {
    try {
      const url = `${this.getGraphApiUrl(`/${psid}`)}?fields=name,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: number; message?: string };
        };
        if (body.error?.code === 2018218) {
          return null;
        }
        this.logger.warn('User profile fetch failed', body);
        return null;
      }
      const data = (await res.json()) as {
        name?: string;
        profile_pic?: string;
      };
      if (!data.name && !data.profile_pic) return null;
      return data;
    } catch (err) {
      this.logger.warn('User profile fetch error', err);
      return null;
    }
  }

  async getFacebookPageInfo(pageAccessToken: string) {
    const url = `${this.getGraphApiUrl('/me')}?fields=id,name,picture&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new ConflictException(
        err?.error?.message || 'Invalid Page access token',
      );
    }
    const data = (await res.json()) as {
      id: string;
      name: string;
      picture?: { data?: { url?: string } };
    };
    return {
      pageId: data.id,
      pageName: data.name,
      picture: data.picture?.data?.url,
    };
  }

  async connect(
    organizationId: string,
    dto: {
      type: 'facebook' | 'instagram';
      pageId?: string;
      pageName?: string;
      pageAccessToken: string;
      instagramAccountId?: string;
    },
  ) {
    let pageId = dto.pageId;
    let pageName = dto.pageName;

    if (dto.type === 'facebook' && (!pageId || !pageName)) {
      const info = await this.getFacebookPageInfo(dto.pageAccessToken);
      pageId = info.pageId;
      pageName = info.pageName;
    }

    if (!pageId || !pageName) {
      throw new ConflictException(
        'Page ID and Page name are required for Instagram. For Facebook, paste only the Page access token and we will fetch them automatically.',
      );
    }

    const tokenValid = await this.validatePageToken(pageId, dto.pageAccessToken);
    if (!tokenValid) {
      throw new ConflictException('Invalid Page access token');
    }

    await this.subscribePageToWebhooks(pageId, dto.pageAccessToken);

    const existing = await this.prisma.channel.findUnique({
      where: {
        organizationId_type_pageId: {
          organizationId,
          type: dto.type,
          pageId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('This Page is already connected');
    }

    const encryptedToken = this.encrypt(dto.pageAccessToken);

    return this.prisma.channel.create({
      data: {
        organizationId,
        type: dto.type,
        pageId,
        pageName,
        pageAccessToken: encryptedToken,
        instagramAccountId: dto.instagramAccountId,
      },
    });
  }

  async list(organizationId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        pageId: true,
        pageName: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async disconnect(organizationId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.prisma.channel.delete({ where: { id: channelId } });
    return { success: true };
  }

  async getChannelWithToken(channelId: string, organizationId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, status: 'active' },
    });
    if (!channel) return null;
    return {
      ...channel,
      pageAccessToken: this.decrypt(channel.pageAccessToken),
    };
  }

  async findChannelByPageId(pageId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { pageId, status: 'active' },
    });
    if (!channel) return null;
    return {
      ...channel,
      pageAccessToken: this.decrypt(channel.pageAccessToken),
    };
  }

  private async validatePageToken(
    pageId: string,
    token: string,
  ): Promise<boolean> {
    try {
      const url = `${this.getGraphApiUrl(`/${pageId}`)}?fields=name&access_token=${encodeURIComponent(token)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) return false;
      const data = (await res.json()) as { name?: string };
      return !!data.name;
    } catch {
      return false;
    }
  }

  async listCustomLabels(
    pageId: string,
    token: string,
  ): Promise<{ id: string; page_label_name: string }[]> {
    try {
      const url = `${this.getGraphApiUrl(`/${pageId}/custom_labels`)}?fields=page_label_name&access_token=${encodeURIComponent(token)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        this.logger.warn('listCustomLabels failed', body);
        return [];
      }
      const data = (await res.json()) as {
        data?: Array<{ id: string; page_label_name?: string }>;
      };
      return (data.data ?? []).map((l) => ({
        id: l.id,
        page_label_name: l.page_label_name ?? l.id,
      }));
    } catch (err) {
      this.logger.warn('listCustomLabels error', err);
      return [];
    }
  }

  async createCustomLabel(
    pageId: string,
    token: string,
    name: string,
  ): Promise<{ id: string } | null> {
    try {
      const url = new URL(this.getGraphApiUrl(`/${pageId}/custom_labels`));
      url.searchParams.set('access_token', token);
      const res = await fetchWithTimeout(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_label_name: name }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string };
      return data.id ? { id: data.id } : null;
    } catch (err) {
      this.logger.warn('createCustomLabel error', err);
      return null;
    }
  }

  async getLabelsForUser(
    psid: string,
    token: string,
  ): Promise<{ id: string; page_label_name: string }[]> {
    try {
      const url = `${this.getGraphApiUrl(`/${psid}/custom_labels`)}?fields=page_label_name&access_token=${encodeURIComponent(token)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        data?: Array<{ id: string; page_label_name?: string }>;
      };
      return (data.data ?? []).map((l) => ({
        id: l.id,
        page_label_name: l.page_label_name ?? l.id,
      }));
    } catch (err) {
      this.logger.warn('getLabelsForUser error', err);
      return [];
    }
  }

  async assignLabelToUser(
    labelId: string,
    psid: string,
    token: string,
  ): Promise<boolean> {
    try {
      const url = new URL(this.getGraphApiUrl(`/${labelId}/label`));
      url.searchParams.set('access_token', token);
      url.searchParams.set('user', psid);
      const res = await fetchWithTimeout(url.toString(), { method: 'POST' });
      return res.ok;
    } catch (err) {
      this.logger.warn('assignLabelToUser error', err);
      return false;
    }
  }

  async uploadAttachment(
    pageId: string,
    token: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<{ attachmentId: string; type: string } | null> {
    try {
      const type = this.mimeToAttachmentType(file.mimetype);
      const form = new FormData();
      form.append('message', JSON.stringify({
        attachment: { type, payload: {} },
      }));
      form.append('filedata', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname ?? 'file');
      form.append('type', file.mimetype);

      const url = `${this.getGraphApiUrl(`/${pageId}/message_attachments`)}?access_token=${encodeURIComponent(token)}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        this.logger.warn('uploadAttachment failed', body);
        return null;
      }
      const data = (await res.json()) as { attachment_id?: string };
      const id = data.attachment_id ?? null;
      return id ? { attachmentId: id, type } : null;
    } catch (err) {
      this.logger.warn('uploadAttachment error', err);
      return null;
    }
  }

  private mimeToAttachmentType(mime: string): 'image' | 'video' | 'audio' | 'file' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'file';
  }

  async removeLabelFromUser(
    labelId: string,
    psid: string,
    token: string,
  ): Promise<boolean> {
    try {
      const url = new URL(this.getGraphApiUrl(`/${labelId}/label`));
      url.searchParams.set('access_token', token);
      url.searchParams.set('user', psid);
      const res = await fetchWithTimeout(url.toString(), { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      this.logger.warn('removeLabelFromUser error', err);
      return false;
    }
  }

  private async subscribePageToWebhooks(
    pageId: string,
    token: string,
  ): Promise<void> {
    try {
      const baseUrl = this.getGraphApiUrl(`/${pageId}/subscribed_apps`);
      const url = new URL(baseUrl);
      url.searchParams.set('access_token', token);
      url.searchParams.set('subscribed_fields', 'messages');

      const res = await fetchWithTimeout(url.toString(), { method: 'POST' });

      const data = (await res.json()) as { success?: boolean; error?: unknown };
      if (!res.ok || !data.success) {
        this.logger.warn(
          'Page webhook subscription failed (page may need pages_manage_metadata)',
          data,
        );
      }
    } catch (err) {
      this.logger.warn('Page webhook subscription error', err);
    }
  }
}
