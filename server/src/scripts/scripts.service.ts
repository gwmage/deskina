import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Script } from '@prisma/client';

@Injectable()
export class ScriptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    name: string;
    description?: string;
    filePath: string;
    content: string;
  }): Promise<Script> {
    return this.prisma.script.create({ data });
  }

  async findAllForUser(userId: string): Promise<Script[]> {
    return this.prisma.script.findMany({ where: { userId } });
  }

  async findOne(id: string, userId: string): Promise<Script | null> {
    const script = await this.prisma.script.findUnique({ where: { id } });
    if (!script || script.userId !== userId) {
      throw new NotFoundException('Script not found or access denied');
    }
    return script;
  }

  async findContent(id: string, userId: string): Promise<string> {
    const script = await this.findOne(id, userId);
    return script.content;
  }
} 