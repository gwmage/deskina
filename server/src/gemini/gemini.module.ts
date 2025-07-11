import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { SessionModule } from 'src/session/session.module';
import { ScriptsModule } from 'src/scripts/scripts.module';

@Module({
  imports: [SessionModule, ScriptsModule],
  controllers: [GeminiController],
  providers: [GeminiService],
})
export class GeminiModule {}