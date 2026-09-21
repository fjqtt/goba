import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [queryFile, resultFile, logFile, limitArg] = process.argv.slice(2);
if (!queryFile || !resultFile || !logFile) {
  process.stderr.write(
    'Usage: npm run run:katago-analysis --workspace @goba/generator -- '
      + '<queries.jsonl> <results.jsonl> <katago.log> [query-limit]\n',
  );
  process.exitCode = 2;
} else {
  await main(queryFile, resultFile, logFile, limitArg ? Number.parseInt(limitArg, 10) : undefined);
}

async function main(queryName: string, resultName: string, logName: string, limit?: number): Promise<void> {
  // /opt/homebrew/opt/katago tracks the currently installed Homebrew version.
  const binary = process.env.KATAGO_BIN ?? '/opt/homebrew/bin/katago';
  const config = process.env.KATAGO_CONFIG
    ?? '/opt/homebrew/opt/katago/share/katago/configs/analysis_example.cfg';
  const model = process.env.KATAGO_MODEL
    ?? '/opt/homebrew/opt/katago/share/katago/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz';
  await Promise.all([binary, config, model].map(async path => access(path, constants.R_OK)));
  const rawQueries = await readFile(resolve(queryName), 'utf8');
  const allQueries = rawQueries.split('\n').filter(Boolean);
  const queries = Number.isInteger(limit) && limit! > 0 ? allQueries.slice(0, limit) : allQueries;
  const resultPath = resolve(resultName);
  const logPath = resolve(logName);
  await Promise.all([mkdir(dirname(resultPath), { recursive: true }), mkdir(dirname(logPath), { recursive: true })]);

  const extraOverrides = process.env.KATAGO_EXTRA_OVERRIDES ? `,${process.env.KATAGO_EXTRA_OVERRIDES}` : '';
  const child = spawn(binary, [
    'analysis', '-config', config, '-model', model,
    '-override-config', `numAnalysisThreads=${process.env.KATAGO_ANALYSIS_THREADS ?? '8'},`
      + `numSearchThreadsPerAnalysisThread=1,nnMaxBatchSize=16${extraOverrides}`,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let completed = 0;
  let reported = 0;
  let buffered = '';
  const started = performance.now();
  child.stdout.on('data', chunk => {
    const bytes = Buffer.from(chunk);
    stdout.push(bytes);
    buffered += bytes.toString('utf8');
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    completed += lines.filter(Boolean).length;
    const reportAt = Math.floor(completed / 100) * 100;
    if (reportAt > reported) {
      reported = reportAt;
      process.stderr.write(`KataGo analysis: ${completed}/${queries.length}\n`);
    }
  });
  child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
  const timeoutMinutes = positiveInt(process.env.KATAGO_TIMEOUT_MINUTES, 60);
  const exitCode = await new Promise<number>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`KataGo analysis exceeded ${timeoutMinutes} minutes`));
    }, timeoutMinutes * 60 * 1000);
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolvePromise(code ?? -1);
    });
    child.stdin.end(`${queries.join('\n')}\n`);
  });
  await Promise.all([
    writeFile(resultPath, Buffer.concat(stdout)),
    writeFile(logPath, Buffer.concat(stderr)),
  ]);
  if (exitCode !== 0) {
    throw new Error(`KataGo exited with ${exitCode}; inspect ${logPath}`);
  }
  const outputCount = Buffer.concat(stdout).toString('utf8').split('\n').filter(Boolean).length;
  if (outputCount !== queries.length) {
    throw new Error(`KataGo returned ${outputCount}/${queries.length} results; inspect ${logPath}`);
  }
  process.stdout.write(`${JSON.stringify({
    queryCount: queries.length,
    outputCount,
    resultPath,
    logPath,
    wallMs: performance.now() - started,
    binary,
    config,
    model,
  })}\n`);
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
