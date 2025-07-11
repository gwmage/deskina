import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Part } from '@google/generative-ai';

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  async create(title: string, userId: string) {
    return this.prisma.session.create({
      data: {
        title,
        userId,
      },
    });
  }

  async findById(sessionId: string) {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addConversation(
    sessionId: string,
    role: 'user' | 'model',
    content: string,
    imageBase64?: string | null,
  ) {
    return this.prisma.conversation.create({
      data: {
        sessionId,
        role,
        content,
        imageBase64,
      },
    });
  }

  async getConversations(sessionId: string, limit = 50) {
    const history = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return history
      .map((conv) => {
        const parts: Part[] = [];
        if (conv.content) {
          try {
            const parsed = JSON.parse(conv.content);
            // Gemini's 'functionCall' corresponds to our 'action'.
            if (parsed.action && parsed.parameters) {
                 parts.push({
                    functionCall: {
                        name: parsed.action,
                        args: parsed.parameters,
                    }
                 });
            } else {
                parts.push({ text: conv.content });
            }
          } catch (e) {
            parts.push({ text: conv.content });
          }
        }
        
        if (conv.role === 'user' && conv.imageBase64) {
          parts.push({
            inlineData: { mimeType: 'image/png', data: conv.imageBase64 },
          });
        }

        return {
          role: conv.role,
          parts: parts.filter(Boolean),
        };
      })
      .filter((h) => h.parts.length > 0);
  }
}
