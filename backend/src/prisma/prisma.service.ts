import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

interface ProductCreateArgs {
  data: { organizationId?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface ProductWhereArgs {
  where?: { organizationId?: string; [key: string]: unknown };
  [key: string]: unknown;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  forOrganization(organizationId: string) {
    return this.$extends({
      query: {
        product: {
          async findMany({ args, query }) {
            args.where = { ...args.where, organizationId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, organizationId };
            return query(args);
          },
          async create({ args, query }) {
            (args as ProductCreateArgs).data.organizationId = organizationId;
            return query(args);
          },
          async update({ args, query }) {
            (args as ProductWhereArgs).where = {
              ...(args as ProductWhereArgs).where,
              organizationId,
            };
            return query(args);
          },
          async delete({ args, query }) {
            (args as ProductWhereArgs).where = {
              ...(args as ProductWhereArgs).where,
              organizationId,
            };
            return query(args);
          },
          async count({ args, query }) {
            args.where = { ...args.where, organizationId };
            return query(args);
          },
        },
      },
    });
  }
}
