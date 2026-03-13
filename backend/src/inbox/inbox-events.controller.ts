import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { InboxEventService } from './inbox-event.service';

@Controller('inbox')
@UseGuards(TenantGuard)
export class InboxEventsController {
  constructor(private readonly inboxEventService: InboxEventService) {}

  @Get('events')
  @SkipThrottle()
  streamEvents(@CurrentTenant() orgId: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const unsubscribe = this.inboxEventService.subscribe(orgId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    res.on('close', () => unsubscribe());
  }
}
