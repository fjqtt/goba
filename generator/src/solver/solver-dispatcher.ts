import type { SolveRequest, SolveResult } from '../domain';
import { executeGnuGoJob } from './gnugo-adapter';
import { executeTsumegoJob } from './tsumego-adapter';

export function executeSolverJob(request: SolveRequest): Promise<SolveResult> {
  if (request.configurationId.startsWith('gnu-go@')) return executeGnuGoJob(request);
  return executeTsumegoJob(request);
}
