import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type Grade,
} from 'ts-fsrs';

export const SCHEDULER_VERSION = 'ts-fsrs@5.2.3/fsrs6/retention-0.90/fuzz-off';

export const SCHEDULER_PARAMETERS = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: false,
});

const scheduler = fsrs(SCHEDULER_PARAMETERS);

export type UserRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export function scheduleReview(
  previous: Card | undefined,
  occurredAt: Date,
  rating: UserRating,
): Card {
  const card: Card = previous ?? createEmptyCard<Card>(occurredAt);
  return scheduler.next(card, occurredAt, toFsrsRating(rating)).card;
}

function toFsrsRating(rating: UserRating): Grade {
  return Rating[rating] as Grade;
}
