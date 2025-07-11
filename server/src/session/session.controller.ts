import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Req, Request } from '@nestjs/common';
import { SessionService } from './session.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async findAll(@Request() req) {
    const userId = req.user.id;
    return this.sessionService.findAllForUser(userId);
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
    const total = await this.sessionService.countConversations(id);
    return { conversations, total };
  }
}
