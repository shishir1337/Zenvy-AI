import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_TENANT_KEY } from './tenant.decorator.skip';

interface SessionData {
  session?: { activeOrganizationId?: string };
}

interface RequestWithSession {
  session?: SessionData;
  organizationId?: string;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipTenant) return true;

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = request.session;
    const activeOrgId = session?.session?.activeOrganizationId;

    if (!activeOrgId) {
      throw new ForbiddenException(
        'No active organization selected. Please select an organization first.',
      );
    }

    request.organizationId = activeOrgId;
    return true;
  }
}
