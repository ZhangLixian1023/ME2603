import "server-only";

import * as postgresDatabase from "./db-postgres";
import * as previewDatabase from "./db-preview";

export type { PublicQuiz, QuestionInput, QuizInput, QuizResults, RosterStudent, RosterPreview, Gradebook, QaItem, ResourceItem } from "./db-types";

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
export const authenticateStudent = database.authenticateStudent;
export const getStudent = database.getStudent;
export const previewRoster = database.previewRoster;
export const syncRoster = database.syncRoster;
export const getGradebook = database.getGradebook;
export const listQa = database.listQa;
export const createQa = database.createQa;
export const answerQa = database.answerQa;
export const listResources = database.listResources;
export const createResource = database.createResource;
export const getResource = database.getResource;
export const deleteResource = database.deleteResource;

export function getDatabaseMode() {
  return isPreviewMode ? "memory-preview" : "postgresql";
}
