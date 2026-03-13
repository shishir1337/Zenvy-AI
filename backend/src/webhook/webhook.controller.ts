import {
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';

@Controller('webhooks/facebook')
@SkipThrottle()
@AllowAnonymous()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @AllowAnonymous()
  verify(@Req() req: Request, @Res() res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken =
      this.config.get<string>('facebook.webhookVerifyToken') ||
      process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

    if (!mode || !token) {
      res.sendStatus(403);
      return;
    }

    const rawChallenge =
      typeof challenge === 'string'
        ? challenge
        : typeof challenge === 'number'
          ? challenge
          : Array.isArray(challenge) && challenge.length > 0
            ? challenge[0]
            : null;
    const challengeStr =
      typeof rawChallenge === 'string' || typeof rawChallenge === 'number'
        ? String(rawChallenge)
        : '';

    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).contentType('text/plain').send(challengeStr);
    } else {
      res.sendStatus(403);
    }
  }

  @Post()
  @AllowAnonymous()
  handleEvent(@Req() req: Request, @Res() res: Response): void {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).send('Raw body required');
      return;
    }

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const appSecret =
      this.config.get<string>('facebook.appSecret') ||
      process.env.FACEBOOK_APP_SECRET;

    if (process.env.NODE_ENV === 'production' && !appSecret) {
      res.status(503).json({
        error:
          'Webhook signature verification failed: FACEBOOK_APP_SECRET not configured',
      });
      return;
    }

    if (appSecret) {
      if (!signature) {
        throw new UnauthorizedException('Missing X-Hub-Signature-256');
      }
      const expected =
        'sha256=' +
        createHmac('sha256', appSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const body = req.body as {
      object?: string;
      entry?: Array<{
        id: string;
        time?: number;
        messaging?: Array<{
          sender: { id: string };
          recipient: { id: string };
          message?: { mid?: string; text?: string };
        }>;
      }>;
    };

    if (body.object === 'page' || body.object === 'instagram') {
      res.status(200).send('EVENT_RECEIVED');
      this.webhookService.processWebhook(body).catch((err) => {
        this.logger.error('Webhook processing error', err);
      });
    } else {
      res.sendStatus(404);
    }
  }
}
