import { Injectable, Logger } from '@nestjs/common';
import { Part } from '@google/generative-ai';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
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

  async findAllForUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: skip,
      take: limit,
    });
  }

  async addConversation(
    sessionId: string,
    role: 'user' | 'model' | 'function',
    parts: Part[],
  ) {
    // The 'parts' array can contain complex objects, which Prisma expects as JsonValue
    const partsAsJson = parts as unknown as Prisma.JsonArray;
    
    return this.prisma.conversation.create({
      data: {
        sessionId,
        role,
        parts: partsAsJson,
      },
    });
  }

  async getConversationsForClient(
    sessionId: string,
    limit = 20,
    skip = 0,
  ) {
    const history = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });

    const clientHistory = [];
    for (const turn of history) {
      try {
        const parts = (turn.parts as unknown as Part[]) || [];
        
        if (turn.role === 'user') {
          const clientTurn = { ...turn };
          // Ensure content/image is available for the client from `parts` if they don't exist (for new data)
          if (!clientTurn.content && parts.some(p => p.text)) {
            clientTurn.content = parts.filter(p => p.text).map(p => p.text).join('\\n');
          }
          if (!clientTurn.imageBase64 && parts.some(p => p.inlineData)) {
            clientTurn.imageBase64 = parts.find(p => p.inlineData)?.inlineData.data;
          }
          clientHistory.push(clientTurn);

        } else if (turn.role === 'model') {
          const textParts = parts.filter(p => p.text);
          const functionCallParts = parts.filter(p => p.functionCall);

          // If there's text, we send a 'model' turn. This handles regular text responses.
          if (textParts.length > 0) {
            clientHistory.push({
              ...turn,
              role: 'model',
              content: textParts.map(p => p.text).join(''),
            });
          }
          // For each function call, we send a corresponding 'system' turn to display the action.
          for (const part of functionCallParts) {
            clientHistory.push({
              id: `${turn.id}-action-${part.functionCall.name}`,
              role: 'system',
              type: 'action_executing',
              content: `⚡️ **${part.functionCall.name}**\\n\`\`\`json\\n${JSON.stringify(part.functionCall.args, null, 2)}\\n\`\`\``,
            });
          }
        } else if (turn.role === 'function') {
            // For each function response, we send a 'system' turn to display the result.
            for (const part of parts) {
                if(part.functionResponse) {
                    const response = part.functionResponse;
                    const resultOutput = (response.response as { output?: string })?.output ?? 'No output.';
                    const success = !String(resultOutput).startsWith('Error:');
                    clientHistory.push({
                        id: `${turn.id}-result-${response.name}`,
                        role: 'system',
                        type: 'action_result',
                        content: resultOutput,
                        success: success,
                    });
                }
            }
        }
      } catch (e) {
        this.logger.error(`Could not process turn with id ${turn.id} for client history: ${e.message}`, e.stack);
      }
    }
    return clientHistory;
  }

  async countConversations(sessionId: string): Promise<number> {
    return this.prisma.conversation.count({
      where: { sessionId },
    });
  }

  async getConversations(sessionId: string, limit = 50) {
    const dbHistory = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const apiHistory: { role: 'user' | 'model' | 'function'; parts: Part[] }[] = [];

    for (const turn of dbHistory) {
      // The 'parts' column is Json?. It can be null for older data.
      if (turn.parts && Array.isArray(turn.parts)) {
        // Cast via 'unknown' to satisfy TypeScript's strictness.
        const parts = turn.parts as unknown as Part[];
        apiHistory.push({ role: turn.role as 'user' | 'model' | 'function', parts });
      } else {
        // Handle legacy data where 'parts' is null and we rely on 'content'.
        const legacyParts: Part[] = [];
        if (turn.content) {
          legacyParts.push({ text: turn.content });
        }
        if (turn.imageBase64) {
          legacyParts.push({ inlineData: { mimeType: 'image/png', data: turn.imageBase64 } });
        }
        if (legacyParts.length > 0) {
          apiHistory.push({ role: turn.role as 'user' | 'model' | 'function', parts: legacyParts });
        }
      }
    }
    return apiHistory;
  }
}
