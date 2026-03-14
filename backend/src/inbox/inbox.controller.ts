import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { InboxService } from './inbox.service';
import { ReplyDto } from './dto/reply.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AssignLabelDto } from './dto/assign-label.dto';

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

  @Patch(':id')
  updateConversation(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.inboxService.updateConversation(orgId, id, dto);
  }

  @Get(':id/attachments')
  getAttachments(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
  ) {
    return this.inboxService.getAttachments(orgId, id);
  }

  @Get(':id/labels/available')
  getAvailableLabels(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
  ) {
    return this.inboxService.listAvailableLabels(orgId, id);
  }

  @Get(':id/labels')
  getLabels(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
  ) {
    return this.inboxService.getLabelsForConversation(orgId, id);
  }

  @Post(':id/labels')
  assignLabel(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: AssignLabelDto,
  ) {
    return this.inboxService.assignLabel(orgId, id, dto);
  }

  @Delete(':id/labels/:labelId')
  removeLabel(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Param('labelId') labelId: string,
  ) {
    return this.inboxService.removeLabel(orgId, id, labelId);
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

  @Post(':id/upload-attachment')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype?: string; originalname?: string },
  ) {
    const result = await this.inboxService.uploadAttachment(orgId, id, file);
    if (!result) throw new ForbiddenException('Upload failed');
    return result;
  }

  @Post(':id/reply')
  reply(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.inboxService.reply(orgId, id, dto);
  }
}
