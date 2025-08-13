import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { SessionModule } from 'src/session/session.module';
import { ScriptsModule } from 'src/scripts/scripts.module';
import { MemoryModule } from 'src/memory/memory.module';

@Module({
  imports: [SessionModule, ScriptsModule, MemoryModule],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}