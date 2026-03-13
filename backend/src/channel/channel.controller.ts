import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { ChannelService } from './channel.service';
import { ConnectChannelDto } from './dto/connect-channel.dto';
import { FacebookPageInfoDto } from './dto/facebook-page-info.dto';

@Controller('channels')
@UseGuards(ThrottlerGuard, TenantGuard)
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post('facebook-page-info')
  async getFacebookPageInfo(@Body() dto: FacebookPageInfoDto) {
    return this.channelService.getFacebookPageInfo(dto.pageAccessToken);
  }

  @Post()
  connect(@CurrentTenant() orgId: string, @Body() dto: ConnectChannelDto) {
    return this.channelService.connect(orgId, dto);
  }

  @Get()
  list(@CurrentTenant() orgId: string) {
    return this.channelService.list(orgId);
  }

  @Delete(':id')
  disconnect(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.channelService.disconnect(orgId, id);
  }
}
