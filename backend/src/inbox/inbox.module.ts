import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxEventsController } from './inbox-events.controller';
import { InboxService } from './inbox.service';
import { InboxEventService } from './inbox-event.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [PrismaModule, ChannelModule],
  controllers: [InboxController, InboxEventsController],
  providers: [InboxService, InboxEventService],
  exports: [InboxEventService, InboxService],
})
export class InboxModule {}
