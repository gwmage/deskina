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
      orderBy: { createdAt: 'desc' },
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
      orderBy: { createdAt: 'desc' }, // Get history in reverse chronological order
      take: limit,
      skip: skip,
    });

    const clientHistory = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < history.length; i++) {
      if (processedIndices.has(i)) {
        continue;
      }

      const turn = history[i];

      // A 'function' role turn contains the results of function calls.
      // It should be preceded by a 'model' role turn that made the calls.
      if (
        turn.role === 'function' &&
        i + 1 < history.length &&
        history[i + 1].role === 'model'
      ) {
        const functionResultTurn = turn;
        const modelCallTurn = history[i + 1];

        const functionCalls = (modelCallTurn.parts as unknown as Part[])?.filter(p => p.functionCall).map(p => p.functionCall);
        const functionResponses = (functionResultTurn.parts as unknown as Part[])?.filter(p => p.functionResponse).map(p => p.functionResponse);

        if (functionCalls && functionResponses && functionCalls.length > 0 && functionCalls.length === functionResponses.length) {
            // Iterate backwards through the calls/responses because the history is DESC.
            // This adds them to clientHistory in chronological order for that pair.
            for (let j = functionCalls.length - 1; j >= 0; j--) {
                const call = functionCalls[j];
                const response = functionResponses[j];

                if (!call || !response) continue;

                const resultOutput = (response.response as { output?: string })?.output ?? 'No output.';
                const success = !String(resultOutput).startsWith('Error:');
                
                // Add the result display first
                clientHistory.push({
                    id: `${functionResultTurn.id}-result-${j}`,
                    role: 'system',
                    type: 'action_result',
                    content: resultOutput,
                    success: success,
                });

                // Then add the call display
                clientHistory.push({
                    id: `${modelCallTurn.id}-action-${j}`,
                    role: 'system',
                    type: 'action_executing',
                    content: `⚡️ **${call.name}**\n\`\`\`json\n${JSON.stringify(call.args, null, 2)}\n\`\`\``,
                });
            }
          
            processedIndices.add(i);
            processedIndices.add(i + 1);
            continue; // Skip the raw 'function' and 'model' turns
        }
      }
      
      // Only add user turns or model turns that are simple text responses.
      if (turn.role === 'user' || (turn.role === 'model' && !(turn.parts as unknown as Part[])?.some(p => p.functionCall))) {
          clientHistory.push(turn);
      }
    }
    return clientHistory; // The client expects DESC order and will reverse it.
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
