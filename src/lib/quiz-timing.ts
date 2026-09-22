import type { QuizTimingRules } from "./db-types";

export const quizTimingRules: QuizTimingRules = {
  durationSeconds: 10 * 60,
  extensionSeconds: 2 * 60,
  extensionCheckSeconds: 60,
  extensionThreshold: 0.4,
  minimumParticipants: 5,
  progressRefreshSeconds: 30,
};

export function shouldExtendQuiz(startedCount: number, unsubmittedCount: number) {
  return (
    startedCount >= quizTimingRules.minimumParticipants &&
    unsubmittedCount / startedCount > quizTimingRules.extensionThreshold
  );
}
