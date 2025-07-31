import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { Logger } from '@nestjs/common';

// --- 진단용 코드 시작 ---
const originalFetch = global.fetch;
global.fetch = async (url: any, options: any) => {
  const logger = new Logger('GlobalFetch');
  const urlString = url.toString();

  // Gemini API 요청만 로깅
  if (urlString.includes('generativelanguage.googleapis.com')) {
    logger.debug(`--> Request to: ${urlString}`);
    logger.debug(`--> Request options: ${JSON.stringify(options.body, null, 2)}`);

    try {
      const response = await originalFetch(url, options);
      const responseClone = response.clone();
      const responseBody = await responseClone.text();
      
      logger.debug(`<-- Response from: ${urlString}`);
      logger.debug(`<-- Response status: ${response.status}`);
      logger.debug(`<-- Response body: ${responseBody}`);

      return response;
    } catch (error) {
      logger.error(`XXX Fetch error for: ${urlString}`, error);
      throw error;
    }
  }

  return originalFetch(url, options);
};
// --- 진단용 코드 끝 ---

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
