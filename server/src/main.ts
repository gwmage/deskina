import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
