import { hashBytes } from '@goba/problem-contract';
import { randomUUID } from 'node:crypto';
import type {
  DraftAnnotation,
  DraftRecord,
  CanonicalTask,
  SolveJobRecord,
  SolveJobRequestInput,
  SolveRequest,
  SolveResult,
} from './domain';

export class DraftNotFoundError extends Error {}
export class DraftRevisionConflictError extends Error {}
export class DraftAnnotationError extends Error {}
export class DraftNotReadyError extends Error {}
export class JobNotFoundError extends Error {}
export class IdempotencyConflictError extends Error {}

export class MemoryGeneratorStore {
  readonly #drafts = new Map<string, DraftRecord>();
  readonly #jobs = new Map<string, SolveJobRecord>();
  readonly #idempotency = new Map<string, { jobId: string; fingerprint: string }>();

  putImportedDrafts(drafts: DraftRecord[]): void {
    for (const draft of drafts) {
      if (!this.#drafts.has(draft.draftId)) this.#drafts.set(draft.draftId, structuredClone(draft));
    }
  }

  listDrafts(offset = 0, limit = 100): { total: number; items: DraftRecord[] } {
    const all = [...this.#drafts.values()].sort((left, right) => left.draftId.localeCompare(right.draftId));
    return { total: all.length, items: structuredClone(all.slice(offset, offset + limit)) };
  }

  getDraft(draftId: string): DraftRecord | undefined {
    const draft = this.#drafts.get(draftId);
    return draft ? structuredClone(draft) : undefined;
  }

  async annotateDraft(
    draftId: string,
    expectedRevision: number,
    annotation: DraftAnnotation,
  ): Promise<DraftRecord> {
    const current = this.#drafts.get(draftId);
    if (!current) throw new DraftNotFoundError(`Draft ${draftId} does not exist`);
    if (current.revision !== expectedRevision) {
      throw new DraftRevisionConflictError(`Expected revision ${expectedRevision}, current is ${current.revision}`);
    }
    const candidate = current.targetCandidates.find(item => (
      item.color === annotation.targetColor && item.anchors.includes(annotation.anchor)
    ));
    if (!candidate) {
      throw new DraftAnnotationError('Anchor is not part of a target candidate with the requested color');
    }

    const nextRevision = current.revision + 1;
    const canonicalWithoutHash = {
      taskVersion: 1 as const,
      draftId,
      draftRevision: nextRevision,
      position: current.position,
      goal: {
        kind: annotation.goalKind,
        targetColor: annotation.targetColor,
        anchors: candidate.anchors,
        quantifier: annotation.goalKind === 'capture'
          ? 'all-captured' as const
          : 'any-unconditionally-alive' as const,
        seki: 'unsupported' as const,
        ko: 'unsupported' as const,
      },
      studentColor: annotation.studentColor ?? current.position.toPlay,
      rules: {
        profile: 'ld-v1' as const,
        suicide: 'forbidden' as const,
        repetition: 'situational-superko' as const,
        externalKo: 'none' as const,
        pass: 'allowed' as const,
      },
      boundary: annotation.boundary,
      viewport: current.viewport,
      transformations: [] as [],
      source: {
        assetSha256: current.assetSha256,
        sourceUri: current.source.sourceUri,
        pageOrNodePath: current.source.pageOrNodePath,
        licenseId: current.source.licenseId,
        distribution: current.source.distribution,
      },
      confirmed: {
        boardBy: annotation.confirmedBy,
        goalBy: annotation.confirmedBy,
        at: new Date().toISOString(),
      },
    };
    const semanticHash = await hashBytes(new TextEncoder().encode(stableJson(canonicalWithoutHash)));
    const canonicalTask: CanonicalTask = { ...canonicalWithoutHash, semanticHash };
    const next: DraftRecord = {
      ...current,
      revision: nextRevision,
      status: 'validated',
      canonicalTask,
      updatedAt: new Date().toISOString(),
    };
    this.#drafts.set(draftId, next);
    return structuredClone(next);
  }

  createJob(input: SolveJobRequestInput, idempotencyKey: string): { job: SolveJobRecord; created: boolean } {
    const fingerprint = stableJson(input);
    const existing = this.#idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError('Idempotency key was already used for another request');
      }
      return { job: structuredClone(this.#jobs.get(existing.jobId)!), created: false };
    }

    const draft = this.#drafts.get(input.draftId);
    if (!draft) throw new DraftNotFoundError(`Draft ${input.draftId} does not exist`);
    if (draft.revision !== input.draftRevision) {
      throw new DraftRevisionConflictError(`Expected revision ${input.draftRevision}, current is ${draft.revision}`);
    }
    if (draft.status !== 'validated' || !draft.canonicalTask) {
      throw new DraftNotReadyError('Draft must have a confirmed goal and target before solving');
    }

    const now = new Date().toISOString();
    const jobId = `job-${randomUUID()}`;
    const request: SolveRequest = {
      jobId,
      task: draft.canonicalTask,
      forcedPath: [],
      limits: input.limits,
      seed: input.seed,
      configurationId: input.adapter === 'gnugo-owl'
        ? 'gnu-go@3.8/owl/adapter-v1/ld-v1'
        : 'tsumego-js@1.1.0/adapter-v1/ld-v1',
      wrongMoveDepth: input.wrongMoveDepth,
    };
    const job: SolveJobRecord = {
      jobId,
      draftId: draft.draftId,
      draftRevision: draft.revision,
      idempotencyKey,
      status: 'queued',
      request,
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(jobId, job);
    this.#idempotency.set(idempotencyKey, { jobId, fingerprint });
    this.#drafts.set(draft.draftId, { ...draft, status: 'queued', updatedAt: now });
    return { job: structuredClone(job), created: true };
  }

  getJob(jobId: string): SolveJobRecord | undefined {
    const job = this.#jobs.get(jobId);
    return job ? structuredClone(job) : undefined;
  }

  startJob(jobId: string): SolveJobRecord {
    const current = this.#jobs.get(jobId);
    if (!current) throw new JobNotFoundError(`Job ${jobId} does not exist`);
    const now = new Date().toISOString();
    const next: SolveJobRecord = { ...current, status: 'solving', updatedAt: now };
    this.#jobs.set(jobId, next);
    const draft = this.#drafts.get(current.draftId);
    if (draft) this.#drafts.set(draft.draftId, { ...draft, status: 'solving', updatedAt: now });
    return structuredClone(next);
  }

  completeJob(jobId: string, result: SolveResult): SolveJobRecord {
    const current = this.#jobs.get(jobId);
    if (!current) throw new JobNotFoundError(`Job ${jobId} does not exist`);
    const now = new Date().toISOString();
    const next: SolveJobRecord = {
      ...current,
      status: result.status === 'error' ? 'failed' : 'complete',
      result,
      updatedAt: now,
    };
    this.#jobs.set(jobId, next);
    const draft = this.#drafts.get(current.draftId);
    if (draft) this.#drafts.set(draft.draftId, { ...draft, status: 'quality-review', updatedAt: now });
    return structuredClone(next);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
