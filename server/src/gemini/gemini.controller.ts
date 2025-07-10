import { Controller, Get, Query, Res, Sse } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Response } from 'express';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get('conversation-stream')
  @Sse()
  async conversationStream(
    @Query('userId') userId: string,
    @Query('message') message: string,
    @Query('sessionId') sessionId: string,
    @Query('platform') platform: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = this.geminiService.generateStream(
        userId,
        message,
        sessionId,
        null, // imageBase64 is not handled in this endpoint for now
        platform,
      );

      for await (const chunk of stream) {
        // The service now yields the data directly, not wrapped in a `data` object
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      console.error(`[GeminiController] Error in stream generator:`, error);
      const errorPayload = {
        type: 'error',
        payload: {
          message: error.message || 'An unknown error occurred on the server.',
          // Include additional details if it's a known API error type
          ...(error.constructor?.name === 'ApiError' && {
            apiError: true,
            status: (error as any).status,
            details: error.message,
          }),
        },
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
    } finally {
      res.end();
    }
  }
}
