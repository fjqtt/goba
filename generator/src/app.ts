import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SolveRequest, SolveResult } from './domain';
import { DraftAnnotationSchema, SgfImportRequestSchema, SolveJobRequestSchema } from './domain';
import { importSgfCollection, SgfImportError } from './sgf/importer';
import { executeSolverJob } from './solver/solver-dispatcher';
import {
  DraftAnnotationError,
  DraftNotFoundError,
  DraftNotReadyError,
  DraftRevisionConflictError,
  IdempotencyConflictError,
  MemoryGeneratorStore,
} from './store';

const DraftParamsSchema = z.object({ id: z.string().min(1) });
const ListQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export function createApp(
  options: {
    logger?: boolean;
    store?: MemoryGeneratorStore;
    executeJob?: (request: SolveRequest) => Promise<SolveResult>;
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 6 * 1024 * 1024 });
  const store = options.store ?? new MemoryGeneratorStore();
  const executeJob = options.executeJob ?? executeSolverJob;

  app.get('/health', async () => ({ status: 'ok', service: 'goba-generator' }));

  app.post('/v1/imports/sgf', async (request, reply) => {
    const parsed = SgfImportRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(problem('invalid-request', parsed.error.message));
    try {
      const imported = await importSgfCollection(parsed.data.content, parsed.data.source);
      store.putImportedDrafts(imported.drafts);
      return reply.code(201).send({
        importId: `import-${imported.assetSha256.slice(7, 23)}`,
        assetSha256: imported.assetSha256,
        draftCount: imported.drafts.length,
        statuses: { 'needs-annotation': imported.drafts.length },
        draftIds: imported.drafts.map(draft => draft.draftId),
      });
    } catch (error) {
      if (error instanceof SgfImportError) {
        return reply.code(422).send(problem(error.code, error.message));
      }
      throw error;
    }
  });

  app.get('/v1/drafts', async (request, reply) => {
    const query = ListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(problem('invalid-query', query.error.message));
    return store.listDrafts(query.data.offset, query.data.limit);
  });

  app.get('/v1/drafts/:id', async (request, reply) => {
    const params = DraftParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(problem('invalid-params', params.error.message));
    const draft = store.getDraft(params.data.id);
    return draft ?? reply.code(404).send(problem('not-found', 'Draft does not exist'));
  });

  app.patch('/v1/drafts/:id', async (request, reply) => {
    const params = DraftParamsSchema.safeParse(request.params);
    const annotation = DraftAnnotationSchema.safeParse(request.body);
    const expectedRevision = parseIfMatch(request.headers['if-match']);
    if (!params.success || !annotation.success || expectedRevision === undefined) {
      return reply.code(400).send(problem(
        'invalid-request',
        'A valid draft annotation and numeric If-Match revision are required',
      ));
    }
    try {
      return await store.annotateDraft(params.data.id, expectedRevision, annotation.data);
    } catch (error) {
      if (error instanceof DraftNotFoundError) return reply.code(404).send(problem('not-found', error.message));
      if (error instanceof DraftRevisionConflictError) return reply.code(409).send(problem('revision-conflict', error.message));
      if (error instanceof DraftAnnotationError) return reply.code(422).send(problem('invalid-annotation', error.message));
      throw error;
    }
  });

  app.post('/v1/jobs', async (request, reply) => {
    const input = SolveJobRequestSchema.safeParse(request.body);
    const idempotencyKey = request.headers['idempotency-key'];
    if (!input.success || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      return reply.code(400).send(problem(
        'invalid-request',
        'A valid solve request and Idempotency-Key header are required',
      ));
    }
    try {
      const { job, created } = store.createJob(input.data, idempotencyKey);
      if (created) {
        setImmediate(() => {
          void runJob(store, job.jobId, executeJob);
        });
      }
      return reply.code(created ? 202 : 200).send(job);
    } catch (error) {
      if (error instanceof DraftNotFoundError) return reply.code(404).send(problem('not-found', error.message));
      if (error instanceof DraftRevisionConflictError) return reply.code(409).send(problem('revision-conflict', error.message));
      if (error instanceof IdempotencyConflictError) return reply.code(409).send(problem('idempotency-conflict', error.message));
      if (error instanceof DraftNotReadyError) return reply.code(422).send(problem('draft-not-ready', error.message));
      throw error;
    }
  });

  app.get('/v1/jobs/:id', async (request, reply) => {
    const params = DraftParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(problem('invalid-params', params.error.message));
    const job = store.getJob(params.data.id);
    return job ?? reply.code(404).send(problem('not-found', 'Job does not exist'));
  });

  return app;
}

async function runJob(
  store: MemoryGeneratorStore,
  jobId: string,
  executeJob: (request: SolveRequest) => Promise<SolveResult>,
): Promise<void> {
  const job = store.startJob(jobId);
  try {
    store.completeJob(jobId, await executeJob(job.request));
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const isGnuGo = job.request.configurationId.startsWith('gnu-go@');
    store.completeJob(jobId, {
      jobId,
      status: 'error',
      perspective: 'student-goal',
      outcome: 'unknown',
      inputHash: '',
      effectivePositionHash: '',
      rulesProfile: job.request.task.rules.profile,
      solver: {
        name: isGnuGo ? 'GNU Go Owl' : 'tsumego.js',
        sourceSha: isGnuGo ? 'gnu-go-3.8' : 'npm:tsumego.js@1.1.0',
        binarySha256: isGnuGo ? '' : 'sha256:runtime-javascript-source-pinned-by-lockfile',
        configSha256: '',
        adapterVersion: isGnuGo ? 'gnugo-owl-adapter-v1' : 'tsumego-js-adapter-v1',
      },
      artifacts: { rawResult: '{}', logs: message },
      coverage: 'root-proof',
      statistics: { wallMs: 0 },
      reason: 'crash',
    });
  }
}

function parseIfMatch(value: string | string[] | undefined): number | undefined {
  if (Array.isArray(value)) return undefined;
  const normalized = value?.replace(/^W\//, '').replaceAll('"', '');
  if (!normalized || !/^\d+$/.test(normalized)) return undefined;
  const revision = Number.parseInt(normalized, 10);
  return revision > 0 ? revision : undefined;
}

function problem(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}
