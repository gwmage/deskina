import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Req, Request } from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.id;
    return this.sessionService.findAllForUser(userId, page, limit);
  }

  @Get(':id/conversations')
  async findOne(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const conversations = await this.sessionService.getConversationsForClient(
      id,
      limitNum,
      skip,
    );
    const totalCount = await this.sessionService.countConversations(id);
    return { conversations, totalCount };
  }
}
