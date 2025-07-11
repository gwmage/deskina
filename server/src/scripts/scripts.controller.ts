import { Controller, Get, Param, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScriptsService } from './scripts.service';

@Controller('scripts')
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id/content')
  async getScriptContent(@Param('id') id: string, @Req() req) {
    const userId = req.user.id;
    try {
      const content = await this.scriptsService.findContent(id, userId);
      return { content };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
} 