import type { Card } from 'ts-fsrs';
import type { PuzzleSession } from '../engine/puzzle-session';
import { db, type ReviewEventRecord } from '../storage/database';
import { scheduleReview, SCHEDULER_VERSION, type UserRating } from './scheduler';

export async function recordTerminalReview(
  session: PuzzleSession,
  selectedRating?: Exclude<UserRating, 'Again'>,
): Promise<ReviewEventRecord | undefined> {
  if (!['success', 'failure'].includes(session.phase)) return undefined;

  return db.transaction('rw', db.reviewEvents, db.cards, db.outbox, db.settings, async () => {
    const existing = await db.reviewEvents.where('attemptId').equals(session.attemptId).first();
    if (existing) return existing;

    const now = new Date();
    const device = await getDeviceIdentity();
    const firstTryCorrect = session.phase === 'success'
      && session.hintCount === 0
      && session.path.every(step => step.verdict === 'correct');
    const rating: UserRating = session.phase === 'failure' || session.hintCount > 0
      ? 'Again'
      : selectedRating ?? 'Good';
    const event: ReviewEventRecord = {
      eventId: crypto.randomUUID(),
      attemptId: session.attemptId,
      problemId: session.problem.problemId,
      revision: session.problem.revision,
      learningVersion: session.problem.learningVersion,
      deviceId: device.deviceId,
      deviceSeq: device.deviceSeq,
      occurredAt: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      rating,
      firstTryCorrect,
      hintCount: session.hintCount,
      solutionViewed: false,
      path: session.path,
      schedulerVersion: SCHEDULER_VERSION,
    };

    const cardKey = `${session.problem.problemId}:${session.problem.learningVersion}`;
    const previous = await db.cards.get(cardKey);
    const projection = scheduleReview(previous?.projection as Card | undefined, now, rating);
    await db.reviewEvents.add(event);
    await db.cards.put({
      key: cardKey,
      problemId: session.problem.problemId,
      learningVersion: session.problem.learningVersion,
      projection,
    });
    await db.outbox.add({ eventId: event.eventId, payload: event, attempts: 0, nextAttemptAt: now.toISOString() });
    return event;
  });
}

async function getDeviceIdentity(): Promise<{ deviceId: string; deviceSeq: number }> {
  const storedId = await db.settings.get('device-id');
  const storedSeq = await db.settings.get('device-seq');
  const deviceId = typeof storedId?.value === 'string' ? storedId.value : crypto.randomUUID();
  const deviceSeq = typeof storedSeq?.value === 'number' ? storedSeq.value + 1 : 1;
  await db.settings.put({ key: 'device-id', value: deviceId });
  await db.settings.put({ key: 'device-seq', value: deviceSeq });
  return { deviceId, deviceSeq };
}
