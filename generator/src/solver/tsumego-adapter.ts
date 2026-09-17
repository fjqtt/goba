import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { SolveRequest, SolveResult } from '../domain';

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;

export async function executeTsumegoJob(request: SolveRequest): Promise<SolveResult> {
  const sourceWorker = new URL('./tsumego-worker.ts', import.meta.url);
  const builtWorker = new URL('./tsumego-worker.js', import.meta.url);
  const runningFromSource = import.meta.url.endsWith('.ts');
  const workerPath = fileURLToPath(runningFromSource ? sourceWorker : builtWorker);
  const args = runningFromSource ? ['--import', 'tsx', workerPath] : [workerPath];

  return new Promise(resolve => {
    const child = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${request.limits.memoryMiB}` },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (result: SolveResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(failureResult(request, 'timeout', `Hard timeout after ${request.limits.wallMs} ms`));
    }, request.limits.wallMs);

    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.on('error', error => finish(failureResult(request, 'crash', error.message)));
    child.on('close', code => {
      if (settled) return;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        finish(failureResult(request, 'memory', 'Worker output exceeded limit'));
        return;
      }
      const output = Buffer.concat(stdout).toString('utf8');
      if (code !== 0) {
        finish(failureResult(request, 'crash', Buffer.concat(stderr).toString('utf8') || `Exit ${code}`));
        return;
      }
      try {
        finish(JSON.parse(output) as SolveResult);
      } catch {
        finish(failureResult(request, 'crash', 'Worker returned malformed JSON'));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

function failureResult(
  request: SolveRequest,
  reason: 'timeout' | 'memory' | 'crash',
  logs: string,
): SolveResult {
  return {
    jobId: request.jobId,
    status: 'error',
    perspective: 'student-goal',
    outcome: 'unknown',
    inputHash: '',
    effectivePositionHash: '',
    rulesProfile: request.task.rules.profile,
    solver: {
      name: 'tsumego.js',
      sourceSha: 'npm:tsumego.js@1.1.0',
      binarySha256: 'sha256:runtime-javascript-source-pinned-by-lockfile',
      configSha256: '',
      adapterVersion: 'tsumego-js-adapter-v1',
    },
    artifacts: { rawResult: '{}', logs },
    coverage: 'root-proof',
    statistics: { wallMs: request.limits.wallMs },
    reason,
  };
}
