export class ReadFileDto {
  path: string;
}

export class WriteFileDto {
  path: string;
  content: string;
}

export class RunCommandDto {
  command: string;
} 