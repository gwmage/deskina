import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Request } from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('session')
@UseGuards(JwtAuthGuard) // Apply the guard to the entire controller
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.id;
    return this.sessionService.findAll(userId, page, limit);
  }

  @Get(':id/conversations')
  findOne(
    @Request() req,
    @Param('id') id: string, 
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.id;
    return this.sessionService.findOne(id, userId, page, limit);
  }
}
