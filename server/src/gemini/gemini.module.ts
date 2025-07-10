import { Module } from '@nestjs/common';
import { GeminiController } from './gemini.controller';
import { GeminiService } from './gemini.service';
import { AgentService } from './agent.service';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [GeminiController],
  providers: [
    GeminiService,
    AgentService,
    EmbeddingService,
    VectorStoreService,
  ],
  exports: [GeminiService, AgentService],
})
export class GeminiModule {}