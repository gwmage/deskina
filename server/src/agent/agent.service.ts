import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class AgentService {
  private readonly projectRoot = path.resolve(__dirname, '..', '..', '..');

  async readFile(filePath: string): Promise<string> {
    try {
      const fullPath = this.getSafePath(filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      return `Error reading file ${filePath}: ${error.message}`;
    }
  }

  async writeFile(filePath: string, content: string): Promise<string> {
    try {
      const fullPath = this.getSafePath(filePath);
      await fs.writeFile(fullPath, content, 'utf-8');
      return `File ${filePath} has been written successfully.`;
    } catch (error) {
      return `Error writing file ${filePath}: ${error.message}`;
    }
  }

  async runCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.projectRoot });
      if (stderr) {
        return `STDERR: ${stderr}`;
      }
      return stdout;
    } catch (error) {
      return `Error executing command: ${error.message}`;
    }
  }

  private getSafePath(filePath: string): string {
    const fullPath = path.resolve(this.projectRoot, filePath);
    if (!fullPath.startsWith(this.projectRoot)) {
      throw new Error('File path is outside of the project directory.');
    }
    return fullPath;
  }
} 