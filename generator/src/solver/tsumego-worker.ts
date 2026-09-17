import { runTsumegoJs } from './tsumego-runner';
import type { SolveRequest } from '../domain';

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

try {
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SolveRequest;
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
  const result = await runTsumegoJs(request);
  console.log = originalLog;
  result.artifacts.logs = [result.artifacts.logs, ...logs].filter(Boolean).join('\n');
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`);
  process.exitCode = 1;
}
