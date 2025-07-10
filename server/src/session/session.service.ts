import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(title: string, userId: string) {
    return this.prisma.session.create({
      data: {
        title: title || 'New Conversation',
        userId: userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        conversations: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!session || session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session.');
    }

    return session;
  }
}
