import { Module } from '@nestjs/common';
import { ScriptsService } from './scripts.service';
import { PrismaService } from '../prisma.service';
import { ScriptsController } from './scripts.controller';

@Module({
  controllers: [ScriptsController],
  providers: [ScriptsService, PrismaService],
  exports: [ScriptsService],
})
export class ScriptsModule {} 