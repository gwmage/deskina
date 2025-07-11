import { Controller, Post, Body, Res, UseGuards, Request } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard) // Apply the JWT guard to protect this endpoint
  async conversationStream(
    @Request() req, // Get the whole request object
    @Body()
    body: {
      message: string;
      sessionId: string | null;
      platform: string;
      imageBase64?: string;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Safely get userId from the request object, populated by JwtAuthGuard
    const userId = req.user.id;

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

  @Post('tool-result')
  @UseGuards(JwtAuthGuard)
  async toolResult(
    @Request() req,
    @Body()
    body: {
      sessionId: string;
      toolName: string;
      params: any;
      result: any;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = req.user.id;

    try {
      const stream = this.geminiService.sendToolResult(
        userId,
        body.sessionId,
        body.toolName,
        body.params,
        body.result,
      );

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      const errorPayload = {
        type: 'error',
        payload: { message: error.message || 'Error processing tool result.' },
      };
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
    } finally {
      res.end();
    }
  }
}
