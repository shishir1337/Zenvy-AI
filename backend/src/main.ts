import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.use(
    '/api/webhooks/facebook',
    express.raw({ type: 'application/json' }),
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      const raw = req.body as Buffer | undefined;
      (req as express.Request & { rawBody?: Buffer }).rawBody = raw;
      req.body =
        raw && raw.length > 0
          ? (JSON.parse(raw.toString()) as Record<string, unknown>)
          : {};
      next();
    },
  );

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.path === '/api/webhooks/facebook') return next();
      express.json()(req, res, next);
    },
  );

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenvy AI API')
    .setDescription(
      'Zenvy AI - Multi-tenant SaaS platform for F-Commerce automation',
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}

void bootstrap();
