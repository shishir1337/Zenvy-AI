import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface RequestWithOrg {
  organizationId?: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithOrg>();
    const orgId = request.organizationId;
    if (!orgId) {
      throw new Error('No organization context');
    }
    return orgId;
  },
);
