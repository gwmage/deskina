import { Module, forwardRef } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { PrismaModule } from '../prisma.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [PrismaModule, forwardRef(() => GeminiModule)],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
