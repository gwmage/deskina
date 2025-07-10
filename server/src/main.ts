import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Increase payload limits
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors(); // Enable Cross-Origin Resource Sharing
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip away properties that are not defined in the DTO
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );
  await app.listen(3001);
}
bootstrap();
