import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Minimal health controller for E2E tests.
 * Avoids PrismaService and @thallesp/nestjs-better-auth to prevent Jest/ESM issues.
 */
@Controller('health')
@SkipThrottle()
export class TestHealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  }
}
