import { Controller, Post, Body, Logger, BadRequestException, Sse, Get, Query } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { AgentService } from './agent.service';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

interface ConversationRequestDto {
  message: string;
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
    @Query('message') message: string,
    @Query('imageBase64') imageBase64?: string,
  ): Observable<MessageEvent> {
    if (!message || typeof message !== 'string') {
      throw new BadRequestException('Message must be a non-empty string.');
    }
    this.logger.debug(
      `Received stream request for message: ${message}`,
    );

    const stream = this.geminiService.generateStream(
      message,
      imageBase64,
    );

    return from(stream).pipe(
      map((data: any) => {
        return new MessageEvent('message', { data: JSON.stringify(data.data) });
      }),
    );
  }

  @Post('conversation')
  async handleConversation(@Body() body: ConversationRequestDto) {
    if (!body.message || typeof body.message !== 'string') {
      throw new BadRequestException('Message must be a non-empty string.');
    }
    this.logger.debug(
      `Received message: ${body.message}`,
    );

    const action = await this.geminiService.generateWithTools(
      body.message,
      body.imageBase64,
    );

    this.logger.debug(`Executing action: ${JSON.stringify(action)}`);
    const result = await this.agentService.execute(action);

    return result;
  }
}
