import { Controller, Post, Body, Res, Sse } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Response } from 'express';
import { VectorStoreService } from './vector-store.service';

interface ConversationRequestBody {
  userId: string;
  message: string;
  sessionId?: string;
  platform: string;
  imageBase64?: string;
}

@Controller('gemini')
export class GeminiController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  @Post('conversation-stream')
  @Sse()
  async conversationStream(
    @Body() body: ConversationRequestBody,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = this.geminiService.generateStream(
        body.userId,
        body.message,
        body.sessionId,
        body.imageBase64,
        body.platform,
      );

      for await (const chunk of stream) {
        // The service now yields the data directly, not wrapped in a `data` object
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      console.error(`[GeminiController] Error in stream generator:`, error);

      let userFriendlyMessage = 'An unknown error occurred on the server.';
      if (error.message?.includes('quota')) {
        userFriendlyMessage = '✨ You are a power user! You have exceeded the daily free quota for the AI. Please try again tomorrow.';
      }

      const errorAction = {
        action: 'reply',
        parameters: {
          content: [{ type: 'text', value: `🤖 Oops! ${userFriendlyMessage}` }],
        },
      };

      // Persist the error message to the database
      if (body.sessionId) {
        try {
          await this.vectorStoreService.addConversation(
            body.sessionId,
            'model',
            JSON.stringify([errorAction]), // History is an array of actions
          );
        } catch (dbError) {
          console.error(`[GeminiController] Failed to save error message to DB:`, dbError);
        }
      }

      // Send the error message to the client as a final event
      const finalErrorPayload = { type: 'final', payload: [errorAction] };
      res.write(`data: ${JSON.stringify(finalErrorPayload)}\n\n`);
    } finally {
      res.end();
    }
  }
}
