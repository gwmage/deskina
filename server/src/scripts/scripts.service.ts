import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Script } from '@prisma/client';

@Injectable()
export class ScriptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    name: string;
    description?: string;
    code: string; // 'content' is renamed to 'code' for clarity
  }): Promise<Script> {
    const existing = await this.prisma.script.findUnique({
      where: {
        userId_name: {
          userId: data.userId,
          name: data.name,
        },
      },
    });
    if (existing) {
      // If script with same name exists, update it
      return this.prisma.script.update({
        where: { id: existing.id },
        data: {
          description: data.description,
          code: data.code,
        },
      });
    }
    // Otherwise, create a new one
    return this.prisma.script.create({ 
        data: {
            userId: data.userId,
            name: data.name,
            description: data.description,
            code: data.code,
        }
    });
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

  async findByName(name: string, userId: string): Promise<Script | null> {
    const script = await this.prisma.script.findUnique({
      where: {
        userId_name: {
          userId: userId,
          name: name,
        },
      },
    });
    if (!script) {
      throw new NotFoundException(`Script with name "${name}" not found.`);
    }
    return script;
  }

  async findContentByName(name: string, userId: string): Promise<string> {
    const script = await this.findByName(name, userId);
    return script.code;
  }
} 