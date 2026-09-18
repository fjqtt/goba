import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { pointToVertex } from '@goba/problem-contract';

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function owlArguments(): string[] {
  return ['--level', '10', '--owl-node-limit', '100000', '--owl-branch', '20', '--owl-reading', '40', '-M', '128'];
}

export async function resolveGnuGoExecutable(command: string): Promise<string | undefined> {
  const candidates = isAbsolute(command)
    ? [command]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

export function runGnuGoProcess(
  executable: string,
  args: string[],
  input: string | undefined,
  timeoutMs: number,
): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail(`GNU Go exceeded ${timeoutMs} ms`), timeoutMs);
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) fail('GNU Go output exceeded 8 MiB');
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) fail('GNU Go output exceeded 8 MiB');
      else stderr.push(Buffer.from(chunk));
    });
    child.on('error', error => fail(error.message));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString('utf8') || `GNU Go exited ${code}`));
      else resolvePromise({ stdout: Buffer.concat(stdout).toString('utf8') });
    });
    child.stdin.end(input);
  });
}

export function pointToSgfCoordinate(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'abcdefghijklmnopqrstuvwxyz'[x]}${'abcdefghijklmnopqrstuvwxyz'[y]}`;
}

export function pointToGtpVertex(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'ABCDEFGHJKLMNOPQRSTUVWXYZ'[x]}${size - y}`;
}

export function gtpVertexToPoint(value: string, size: number): number {
  if (value.toUpperCase() === 'PASS') return -1;
  const column = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(value[0]!.toUpperCase());
  const row = Number.parseInt(value.slice(1), 10);
  if (column < 0 || !Number.isInteger(row) || row < 1 || row > size) return -1;
  return (size - row) * size + column;
}
