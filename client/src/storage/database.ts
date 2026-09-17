import Dexie, { type EntityTable } from 'dexie';
import type { ProblemV1 } from '@goba/problem-contract';
import type { SessionCheckpoint } from '../engine/puzzle-session';

export type PackRecord = {
  key: string;
  packId: string;
  revision: number;
  state: 'staged' | 'ready';
  manifest: unknown;
};

export type StoredProblem = {
  key: string;
  packKey: string;
  problemId: string;
  revision: number;
  problem: ProblemV1;
  tags: string[];
  difficulty: string;
};

export type StoredSession = SessionCheckpoint & { key: 'active' | string };

export type ReviewEventRecord = {
  eventId: string;
  attemptId: string;
  problemId: string;
  revision: number;
  learningVersion: number;
  deviceId: string;
  deviceSeq: number;
  occurredAt: string;
  timezone: string;
  rating: 'Again' | 'Hard' | 'Good' | 'Easy';
  firstTryCorrect: boolean;
  hintCount: number;
  solutionViewed: boolean;
  path: unknown[];
  schedulerVersion: string;
};

export type CardRecord = {
  key: string;
  problemId: string;
  learningVersion: number;
  projection: unknown;
};

export type OutboxRecord = {
  eventId: string;
  payload: ReviewEventRecord;
  attempts: number;
  nextAttemptAt: string;
};

export type SettingRecord = { key: string; value: unknown };

class ClientDatabase extends Dexie {
  packs!: EntityTable<PackRecord, 'key'>;
  problems!: EntityTable<StoredProblem, 'key'>;
  sessions!: EntityTable<StoredSession, 'key'>;
  reviewEvents!: EntityTable<ReviewEventRecord, 'eventId'>;
  cards!: EntityTable<CardRecord, 'key'>;
  outbox!: EntityTable<OutboxRecord, 'eventId'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor() {
    super('goba-client');
    this.version(1).stores({
      packs: '&key, [packId+revision], state',
      problems: '&key, packKey, [problemId+revision], *tags, difficulty',
      sessions: '&key, problemId, revision, updatedAt',
      reviewEvents: '&eventId, &attemptId, problemId, occurredAt',
      cards: '&key, [problemId+learningVersion]',
      outbox: '&eventId, nextAttemptAt',
      settings: '&key',
    });
  }
}

export const db = new ClientDatabase();

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  const storage = navigator.storage;
  if (!storage?.persist) return undefined;
  try {
    if (storage.persisted && await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return undefined;
  }
}

export async function saveActiveSession(checkpoint: SessionCheckpoint): Promise<void> {
  await db.sessions.put({ key: 'active', ...checkpoint });
}

export async function loadActiveSession(): Promise<SessionCheckpoint | undefined> {
  const stored = await db.sessions.get('active');
  if (!stored) return undefined;
  const { key: _key, ...checkpoint } = stored;
  return checkpoint;
}

export async function clearActiveSession(attemptId: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const active = await db.sessions.get('active');
    if (active?.attemptId === attemptId) await db.sessions.delete('active');
  });
}
