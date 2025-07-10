import { Module } from '@nestjs/common';
import { GeminiController } from './gemini.controller';
import { GeminiService } from './gemini.service';
import { AgentService } from './agent.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [GeminiController],
  providers: [
    GeminiService,
    AgentService,
    EmbeddingService,
    VectorStoreService,
    PrismaService,
  ],
  exports: [GeminiService, AgentService],
})
export class GeminiModule {}
