import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @AllowAnonymous()
  async check() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      };
    }
  }
}
