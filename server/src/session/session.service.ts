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

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [sessions, totalCount] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where: { userId },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.session.count({ where: { userId } }),
    ]);
    
    return { sessions, totalCount };
  }

  async findOne(id: string, userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const session = await this.prisma.session.findUnique({
      where: { id, userId },
    });
    
    if (!session) {
      throw new ForbiddenException('You do not have access to this session.');
    }

    const [conversations, totalConversations] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where: { sessionId: id },
        orderBy: {
          createdAt: 'desc', // Fetch latest messages first for pagination
        },
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where: { sessionId: id } }),
    ]);

    // Reverse the order for chronological display on the client
    return { ...session, conversations: conversations.reverse(), totalConversations };
  }
}
