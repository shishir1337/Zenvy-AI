import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { ChannelModule } from '../channel/channel.module';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [ChannelModule, InboxModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
