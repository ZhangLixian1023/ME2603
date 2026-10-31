import type { QuizQuestionHistory, QuizResults } from './db-types';

type QuestionStatistic = QuizResults['statistics']['questions'][number];

export function summarizeQuestionHistory(history: QuizQuestionHistory): QuestionStatistic[] {
  const groups = new Map<string, QuestionStatistic>();

  for (const revision of history.revisions) {
    const occurrences = new Map<string, number>();
    for (const question of revision.questions) {
      // Matching the complete grading rule avoids combining answers to a changed question.
      const signature = JSON.stringify([question.prompt, question.options, question.correctIndex, question.imageKey]);
      const occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      const key = JSON.stringify([signature, occurrence]);
      let group = groups.get(key);
      if (!group) {
        group = {
          questionId: question.questionId,
          prompt: question.prompt,
          position: question.position,
          isCurrent: false,
          revisions: [],
          correctCount: 0,
          responseCount: 0,
          accuracy: 0,
        };
        groups.set(key, group);
      }
      if (revision.revision === history.quiz.currentRevision) group.isCurrent = true;
      if (question.responseCount > 0) {
        group.revisions.push(revision.revision);
        group.correctCount += question.correctCount;
        group.responseCount += question.responseCount;
        group.questionId = question.questionId;
        group.position = question.position;
      }
    }
  }

  return [...groups.values()]
    .filter((group) => group.responseCount > 0)
    .map((group) => ({ ...group, accuracy: group.correctCount / group.responseCount }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) ||
      a.position - b.position || Math.max(...b.revisions) - Math.max(...a.revisions));
}
