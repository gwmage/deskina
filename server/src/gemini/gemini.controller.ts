import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateStream(
    @Request() req,
    @Body()
    body: {
      sessionId?: string;
      message: string;
      platform: string;
      imageBase64?: string;
    },
    @Res() res: Response,
  ) {
    const userId = req.user.id;
    return this.geminiService.generateResponse(userId, body, res);
  }

  @Post('tool-result')
  @UseGuards(JwtAuthGuard)
  async handleToolResult(
    @Request() req,
    @Body()
    body: {
      sessionId: string;
      command: string;
      args: any;
      result: any;
    },
    @Res() res: Response,
  ) {
    const userId = req.user.id;
    return this.geminiService.handleToolResult(userId, body, res);
  }
}
