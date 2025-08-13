import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
