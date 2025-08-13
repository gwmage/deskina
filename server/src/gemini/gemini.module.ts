import { Module, forwardRef } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { SessionModule } from 'src/session/session.module';
import { ScriptsModule } from 'src/scripts/scripts.module';
import { MemoryModule } from 'src/memory/memory.module';

@Module({
  imports: [forwardRef(() => SessionModule), ScriptsModule, MemoryModule],
  controllers: [GeminiController],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}