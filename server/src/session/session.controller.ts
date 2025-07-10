import { Controller, Get, Param, Headers, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  findAll(
    @Headers('x-user-id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.sessionService.findAll(userId, page, limit);
  }

  @Get(':id/conversations')
  findOne(
    @Param('id') id: string, 
    @Headers('x-user-id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.sessionService.findOne(id, userId, page, limit);
  }
}
