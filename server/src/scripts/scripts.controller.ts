import { Controller, Get, Param, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScriptsService } from './scripts.service';

@Controller('scripts')
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('by-name/:name/content')
  async getScriptContent(@Param('name') name: string, @Req() req) {
    const userId = req.user.id;
    try {
      const content = await this.scriptsService.findContentByName(name, userId);
      return { content };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
} 