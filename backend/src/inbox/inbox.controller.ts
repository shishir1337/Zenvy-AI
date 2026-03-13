import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { InboxService } from './inbox.service';
import { ReplyDto } from './dto/reply.dto';

@Controller('conversations')
@UseGuards(ThrottlerGuard, TenantGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  listConversations(
    @CurrentTenant() orgId: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.inboxService.listConversations(orgId, channelId);
  }

  @Get(':id')
  getConversation(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.inboxService.getConversation(orgId, id);
  }

  @Get(':id/messages')
  getMessages(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const clamped = Number.isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 100);
    return this.inboxService.getMessages(orgId, id, clamped, cursor);
  }

  @Post(':id/reply')
  reply(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.inboxService.reply(orgId, id, dto.text);
  }
}
