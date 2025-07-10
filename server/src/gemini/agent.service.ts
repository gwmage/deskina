import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentAction {
  action: string;
  parameters: any;
}

export interface ActionResult {
  action: AgentAction;
  result: any;
  error?: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  async execute(action: AgentAction): Promise<ActionResult> {
    this.logger.debug(`Executing action: ${action.action}`, action.parameters);
    try {
      let result: any;
      switch (action.action) {
        case 'readFile':
          result = await this.readFile(action.parameters.path);
          break;
        case 'writeFile':
          result = await this.writeFile(action.parameters.path, action.parameters.content);
          break;
        case 'runCommand':
          result = await this.runCommand(action.parameters.command);
          break;
        case 'reply':
          // The 'reply' action's result is the text itself.
          result = action.parameters.text;
          break;
        case 'captureScreen':
            // This is a special action that the client must handle.
            // We return the action so the controller can forward it.
            return { action, result: 'Client action required.' };
        default:
          throw new Error(`Unknown action: ${action.action}`);
      }
      return { action, result };
    } catch (error) {
      this.logger.error(`Error executing action "${action.action}":`, error.stack);
      return { action, result: null, error: error.message };
    }
  }

  private async readFile(path: string): Promise<string> {
    this.logger.log(`Reading file: ${path}`);
    return fs.readFile(path, 'utf-8');
  }

  private async writeFile(path: string, content: string): Promise<void> {
    this.logger.log(`Writing to file: ${path}`);
    await fs.writeFile(path, content, 'utf-8');
  }

  private async runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    this.logger.log(`Running command: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    if(stderr) {
        this.logger.warn(`Command stderr: ${stderr}`);
    }
    return { stdout, stderr };
  }
} 