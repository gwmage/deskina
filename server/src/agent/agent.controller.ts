import { Controller, Post, Body } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ReadFileDto, WriteFileDto, RunCommandDto } from './dto/agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('read-file')
  readFile(@Body() readFileDto: ReadFileDto) {
    return this.agentService.readFile(readFileDto.path);
  }

  @Post('write-file')
  writeFile(@Body() writeFileDto: WriteFileDto) {
    return this.agentService.writeFile(writeFileDto.path, writeFileDto.content);
  }

  @Post('run-command')
  runCommand(@Body() runCommandDto: RunCommandDto) {
    return this.agentService.runCommand(runCommandDto.command);
  }
} 