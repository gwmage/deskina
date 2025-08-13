import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MemoryService {
  constructor(private prisma: PrismaService) {}

  async createMemory(userId: string, content: string) {
    return this.prisma.memory.create({
      data: {
        userId,
        content,
      },
    });
  }

  async getMemoriesForUser(userId: string) {
    return this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }
}