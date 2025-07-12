import { Injectable } from '@nestjs/common';
import { Part } from '@google/generative-ai';
import { PrismaService } from 'src/prisma.service';

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
    role: 'user' | 'model' | 'tool',
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

  async getConversationsForClient(
    sessionId: string,
    limit = 20,
    skip = 0,
  ) {
    const history = await this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: skip,
    });

    const clientHistory = [];
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];

      if (turn.role === 'model') {
        try {
          const modelAction = JSON.parse(turn.content);
          if (
            modelAction.action === 'runCommand' ||
            modelAction.action === 'runScript'
          ) {
            // This is a command action. Look for the result in the next turn.
            if (i + 1 < history.length && history[i + 1].role === 'tool') {
              const toolTurn = history[i + 1];
              try {
                const toolResult = JSON.parse(toolTurn.content);
                const commandResult = toolResult.functionResponse?.response;

                if (commandResult) {
                  // Create the action turn
                  const commandStr =
                    modelAction.action === 'runCommand'
                      ? `${modelAction.parameters.command} ${modelAction.parameters.args.join(' ')}`
                      : `python ${modelAction.parameters.name}`;
                  clientHistory.push({
                    ...turn,
                    role: 'system', // Use a role the client can handle generically
                    type: 'action', // Custom type for the client
                    content: `> **${modelAction.action}**: \`${commandStr}\``,
                  });

                  // Create the action_result turn
                  clientHistory.push({
                    ...toolTurn,
                    role: 'system', // Use a role the client can handle generically
                    type: 'action_result', // Custom type for the client
                    content: commandResult.success
                      ? commandResult.stdout
                      : commandResult.stderr,
                    success: commandResult.success,
                  });

                  // Skip the next turn since we've processed it
                  i++;
                  continue; // Continue to the next iteration
                }
              } catch (e) {
                // Failed to parse tool turn, fall through to default behavior
              }
            }
          }
        } catch (e) {
          // Not a JSON action object, fall through to default behavior
        }
      }

      // Default behavior: add the turn as is
      clientHistory.push(turn);
    }
    return clientHistory;
  }

  async countConversations(sessionId: string): Promise<number> {
    return this.prisma.conversation.count({
      where: { sessionId },
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

        if (conv.role === 'model') {
          try {
            // 모델의 응답은 도구 호출(functionCall)이거나 일반 텍스트입니다.
            const parsed = JSON.parse(conv.content);
            if (parsed.action && parsed.parameters) {
              parts.push({
                functionCall: { name: parsed.action, args: parsed.parameters },
              });
            } else {
              parts.push({ text: conv.content });
            }
          } catch (e) {
            parts.push({ text: conv.content });
          }
        } else if (conv.role === 'user') {
          // 사용자의 입력은 텍스트와 이미지(선택)를 포함합니다.
          if (conv.content) {
            parts.push({ text: conv.content });
          }
          if (conv.imageBase64) {
            parts.push({
              inlineData: { mimeType: 'image/png', data: conv.imageBase64 },
            });
          }
        } else if (conv.role === 'tool') {
          // 도구의 응답은 functionResponse 파트입니다.
          try {
            const toolPart = JSON.parse(conv.content);
            parts.push(toolPart);
          } catch (e) {
            console.error('Failed to parse tool content from DB', e);
          }
        }

        return {
          role: conv.role === 'tool' ? 'function' : (conv.role as 'user' | 'model'),
          parts: parts,
        };
      })
      .filter((h) => h.parts.length > 0);
  }
}
