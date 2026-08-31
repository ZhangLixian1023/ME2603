import "server-only";

import * as postgresDatabase from "./db-postgres";
import * as previewDatabase from "./db-preview";

export type { PublicQuiz, QuestionInput, QuizInput, QuizResults } from "./db-types";

const isPreviewMode = process.env.PREVIEW_MODE === "true";
const database = isPreviewMode ? previewDatabase : postgresDatabase;

export const checkDatabase = database.checkDatabase;
export const createQuiz = database.createQuiz;
export const listQuizzes = database.listQuizzes;
export const getTeacherQuiz = database.getTeacherQuiz;
export const updateQuiz = database.updateQuiz;
export const deleteQuiz = database.deleteQuiz;
export const getPublicQuiz = database.getPublicQuiz;
export const setQuizPublished = database.setQuizPublished;
export const submitQuiz = database.submitQuiz;
export const getLeaderboard = database.getLeaderboard;
export const getQuizResults = database.getQuizResults;
export const deleteSubmission = database.deleteSubmission;

export function getDatabaseMode() {
  return isPreviewMode ? "memory-preview" : "postgresql";
}
