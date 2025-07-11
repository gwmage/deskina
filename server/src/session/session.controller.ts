import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Req } from '@nestjs/common';
import { SessionService } from './session.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async findAll(
    @Req() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.userId;
    const result = await this.sessionService.findAll(userId, page, limit);
    return result.sessions; // Return only the sessions array
  }

  @Get(':id/conversations')
  findOne(
    @Req() req,
    @Param('id') id: string, 
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.userId;
    return this.sessionService.findOne(id, userId, page, limit);
  }
}
