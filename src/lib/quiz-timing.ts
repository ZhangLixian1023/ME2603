import type { QuizAttemptState, QuizTimingRules } from "./db-types";

export const defaultQuizDurationMinutes = 10;
export const maximumQuizDurationMinutes = 180;

export function validQuizDurationMinutes(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= maximumQuizDurationMinutes;
}

export const quizTimingRules: QuizTimingRules = {
  durationSeconds: defaultQuizDurationMinutes * 60,
  extensionSeconds: 2 * 60,
  extensionCheckSeconds: 60,
  extensionThreshold: 0.4,
  minimumParticipants: 5,
  progressRefreshSeconds: 30,
};

export function timingRulesForAttempt(attempt: Pick<QuizAttemptState, "startedAt" | "expiresAt" | "extensionCount">): QuizTimingRules {
  const seconds = Math.round((Date.parse(attempt.expiresAt) - Date.parse(attempt.startedAt)) / 1000)
    - attempt.extensionCount * quizTimingRules.extensionSeconds;
  return { ...quizTimingRules, durationSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : quizTimingRules.durationSeconds };
}

export function shouldExtendQuiz(startedCount: number, unsubmittedCount: number) {
  return (
    startedCount >= quizTimingRules.minimumParticipants &&
    unsubmittedCount / startedCount > quizTimingRules.extensionThreshold
  );
}
