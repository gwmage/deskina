import { Controller, Sse, Get, Query, UseGuards, Req, Logger, BadRequestException } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';


@UseGuards(JwtAuthGuard)
@Controller('gemini')
export class GeminiController {
  private readonly logger = new Logger(GeminiController.name);

  constructor(
    private readonly geminiService: GeminiService,
  ) {}

  @Sse('conversation-stream')
  conversationStream(
    @Query('message') message: string,
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    if (!message) {
      throw new BadRequestException('Message is required');
    }
    const userId = req.user.id;
    const streamGenerator = this.geminiService.generateStream(
      userId,
      message,
      sessionId,
    );
    
    // Convert the async generator to an Observable
    const observable = new Observable<MessageEvent>(subscriber => {
      (async () => {
        try {
          for await (const value of streamGenerator) {
            if (subscriber.closed) return;
            // The generator itself yields the object with a `data` property.
            subscriber.next(value as MessageEvent); 
          }
          subscriber.complete();
        } catch (err) {
          this.logger.error(`Error in stream generator: ${err}`);
          subscriber.error(err);
        }
      })();
    });

    return observable;
  }
}
