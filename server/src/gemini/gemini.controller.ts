import { Controller, Post, Body, Res, Headers } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Response } from 'express';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('conversation-stream')
  async conversationStream(
    @Body()
    body: {
      message: string;
      sessionId: string | null;
      platform: string;
      imageBase64?: string;
    },
    @Headers('x-user-id') userId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = this.geminiService.generateResponse(
        userId,
        body.message,
        body.platform,
        body.sessionId,
        body.imageBase64,
      );

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      const errorPayload = {
        type: 'error',
        payload: {
          message:
            error.message || 'An unexpected error occurred on the server.',
          details: error.details,
        },
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
    } finally {
      res.end();
    }
  }
}
