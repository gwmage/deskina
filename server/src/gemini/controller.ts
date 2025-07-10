import { Controller, Get, Query, Sse } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { AgentService } from './agent.service';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConversationStreamDto } from './dto/conversation-stream.dto';

interface ConversationRequestDto {
  message: string;
  sessionId: string;
  imageBase64?: string;
}

@Controller('gemini')
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly agentService: AgentService,
  ) {}

  @Sse('conversation-stream')
  handleConversationStream(
    @Query() query: ConversationStreamDto,
  ): Observable<MessageEvent> {
    if (!query.message || typeof query.message !== 'string') {
      throw new BadRequestException('Message must be a non-empty string.');
    }
    this.logger.debug(
      `Received stream request for message: ${query.message} in session: ${query.sessionId}`,
    );

    const stream = this.geminiService.generateStream(
      query.message,
      query.sessionId,
      query.imageBase64,
    );

    return from(stream).pipe(
      map((event) => {
        if (event.type === 'message') {
          return new MessageEvent('message', {
            data: JSON.stringify(event.data),
          });
        }
        return event;
      }),
    );
  }
} 