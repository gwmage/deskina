import { Injectable, Logger } from '@nestjs/common';
import { Part } from '@google/generative-ai';
import { PrismaService } from '../prisma.service';

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
      orderBy: { createdAt: 'desc' },
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
            modelAction.action === 'runScript' ||
            modelAction.action === 'readFile'
          ) {
            // This is a command action. Look for the result in the next turn.
            if (i + 1 < history.length && history[i + 1].role === 'tool') {
              const toolTurn = history[i + 1];
              try {
                // The content from a 'tool' role is a JSON string containing the 'functionResponse' object.
                const toolContentObject = JSON.parse(toolTurn.content);
                const commandResult = toolContentObject.functionResponse?.response;

                if (commandResult) {
                  // Let's create the 'action' turn display
                  const commandStr =
                    modelAction.action === 'runCommand'
                      ? `${modelAction.parameters.command} ${modelAction.parameters.args.join(' ')}`
                      : modelAction.action === 'runScript'
                        ? `python ${modelAction.parameters.name}`
                        : `${modelAction.parameters.filePath}`;

                  clientHistory.push({
                    ...turn,
                    id: turn.id + '-action',
                    role: 'system',
                    type: 'action',
                    content: `> **${modelAction.action}**: \`${commandStr}\``,
                  });

                  // And the 'action_result' turn
                  clientHistory.push({
                    ...toolTurn,
                    id: toolTurn.id + '-result',
                    role: 'system',
                    type: 'action_result',
                    content: commandResult.success
                      ? commandResult.stdout
                      : commandResult.stderr || commandResult.error,
                    success: commandResult.success,
                  });

                  // Skip the next turn since we've processed it
                  i++;
                  // Also skip the AI's summary text that follows the tool result, if it exists
                  if (
                    i + 1 < history.length &&
                    history[i + 1].role === 'model'
                  ) {
                    i++;
                  }
                  continue; // Continue to the next iteration
                }
              } catch (e) {
                this.logger.error(
                  `Failed to parse tool turn content: ${toolTurn.content}`,
                  e.stack,
                );
                // Fallthrough to add the problematic model turn as is
              }
            }
          }
        } catch (e) {
          // Not a JSON action object, it's just a regular text message.
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
