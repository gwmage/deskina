import { Module } from '@nestjs/common';
import { GeminiController } from './gemini.controller';
import { GeminiService } from './gemini.service';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from 'src/session/session.module';
import { ScriptsModule } from 'src/scripts/scripts.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule, SessionModule, ScriptsModule],
  controllers: [GeminiController],
  providers: [GeminiService, PrismaService],
})
export class GeminiModule {}