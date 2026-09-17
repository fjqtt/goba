import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { SolveRequest, SolveResult } from './domain';

const apps: Array<ReturnType<typeof createApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
});

describe('Generator API', () => {
  it('imports, lists and annotates an SGF draft with optimistic revision checking', async () => {
    const app = createApp();
    apps.push(app);
    const imported = await app.inject({
      method: 'POST',
      url: '/v1/imports/sgf',
      payload: {
        content: '(;FF[4]GM[1]SZ[9]PL[B]AB[aa][ba]AW[ab][bb])',
        source: {
          sourceUri: 'file:///cho-1.sgf',
          collection: 'Cho elementary fixture',
          attribution: 'Fixture',
          licenseId: 'LicenseRef-Restricted',
          distribution: 'restricted',
        },
      },
    });
    expect(imported.statusCode).toBe(201);
    const importedBody = imported.json<{ draftIds: string[]; draftCount: number }>();
    expect(importedBody.draftCount).toBe(1);

    const draftId = importedBody.draftIds[0]!;
    const annotated = await app.inject({
      method: 'PATCH',
      url: `/v1/drafts/${draftId}`,
      headers: { 'if-match': '1' },
      payload: {
        goalKind: 'capture',
        targetColor: 'W',
        anchor: 9,
        boundary: { kind: 'full-board', assumptions: [] },
        confirmedBy: 'test-curator',
      },
    });
    expect(annotated.statusCode).toBe(200);
    expect(annotated.json()).toMatchObject({
      revision: 2,
      status: 'validated',
      canonicalTask: {
        draftRevision: 2,
        studentColor: 'B',
        goal: { kind: 'capture', targetColor: 'W', anchors: [9, 10] },
      },
    });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/v1/drafts/${draftId}`,
      headers: { 'if-match': '1' },
      payload: {
        goalKind: 'capture', targetColor: 'W', anchor: 9, confirmedBy: 'test-curator',
      },
    });
    expect(stale.statusCode).toBe(409);

    const listed = await app.inject({ method: 'GET', url: '/v1/drafts' });
    expect(listed.json<{ total: number }>().total).toBe(1);
  });

  it('queues a confirmed draft exactly once for an idempotency key', async () => {
    const receivedRequests: SolveRequest[] = [];
    const executeJob = async (request: SolveRequest): Promise<SolveResult> => {
      receivedRequests.push(request);
      return {
        jobId: request.jobId,
        status: 'proven-win',
        perspective: 'student-goal',
        outcome: 'target-captured',
        inputHash: 'sha256:input',
        effectivePositionHash: 'sha256:position',
        rulesProfile: 'ld-v1',
        solver: {
          name: 'fixture', sourceSha: 'fixture', binarySha256: 'fixture',
          configSha256: 'fixture', adapterVersion: 'fixture-v1',
        },
        artifacts: { rawResult: '{"rootMove":"B[cc]"}', logs: '' },
        coverage: 'root-proof',
        statistics: { wallMs: 1 },
      };
    };
    const app = createApp({ executeJob });
    apps.push(app);
    const imported = await app.inject({
      method: 'POST',
      url: '/v1/imports/sgf',
      payload: {
        content: '(;FF[4]GM[1]SZ[9]PL[B]AB[aa][ba]AW[ab][bb])',
        source: {
          sourceUri: 'file:///fixture.sgf', collection: 'Fixture', attribution: 'Fixture',
          licenseId: 'LicenseRef-Test', distribution: 'restricted',
        },
      },
    });
    const draftId = imported.json<{ draftIds: string[] }>().draftIds[0]!;
    await app.inject({
      method: 'PATCH', url: `/v1/drafts/${draftId}`, headers: { 'if-match': '1' },
      payload: { goalKind: 'capture', targetColor: 'W', anchor: 9, confirmedBy: 'test' },
    });

    const payload = { draftId, draftRevision: 2, adapter: 'gnugo-owl' };
    const queued = await app.inject({
      method: 'POST', url: '/v1/jobs', headers: { 'idempotency-key': 'fixture-job' }, payload,
    });
    expect(queued.statusCode).toBe(202);
    const jobId = queued.json<{ jobId: string }>().jobId;
    const duplicate = await app.inject({
      method: 'POST', url: '/v1/jobs', headers: { 'idempotency-key': 'fixture-job' }, payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<{ jobId: string }>().jobId).toBe(jobId);

    await new Promise<void>(resolve => setImmediate(resolve));
    const completed = await app.inject({ method: 'GET', url: `/v1/jobs/${jobId}` });
    expect(completed.json()).toMatchObject({
      jobId,
      status: 'complete',
      result: { status: 'proven-win', outcome: 'target-captured' },
    });
    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0]!.configurationId).toBe('gnu-go@3.8/owl/adapter-v1/ld-v1');
  });
});
