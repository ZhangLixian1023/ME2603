import "server-only";

import { randomUUID } from "node:crypto";
import type { PublicQuiz, QuestionInput, QuizInput, QuizResults, RosterStudent, Gradebook, QaItem, ResourceItem } from "./db-types";

type PreviewQuestion = QuestionInput & { id: number };
type PreviewQuiz = {
  id: number;
  code: string;
  title: string;
  description: string;
  isPublished: boolean;
  createdAt: string;
  questions: PreviewQuestion[];
};
type PreviewSubmission = {
  id: number;
  quizId: number;
  studentId: string;
  nickname: string;
  score: number;
  total: number;
  answers: number[];
  correctness: boolean[];
  submittedAt: string;
};
type PreviewStore = {
  quizzes: PreviewQuiz[];
  submissions: PreviewSubmission[];
  nextQuizId: number;
  nextQuestionId: number;
  nextSubmissionId: number;
  students: Array<{ studentId: string; name: string; active: boolean }>;
  rosterImports: Map<string, RosterStudent[]>;
  qa: Array<{ id: number; studentId: string; studentName: string; question: string; imageKey?: string | null; answer?: string | null; createdAt: string; answeredAt?: string | null }>;
  resources: Array<{ id: number; title: string; filename: string; mimeType: string; size: number; objectKey: string; createdAt: string }>;
  nextQaId: number;
  nextResourceId: number;
};

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const previewGlobal = globalThis as typeof globalThis & {
  __quizPreviewStore?: PreviewStore;
};

function seedQuestions(): QuestionInput[] {
  return [
    { prompt: "水在标准大气压下的沸点是多少？", options: ["0°C", "50°C", "100°C", "120°C"], correctIndex: 2 },
    { prompt: "地球绕哪一颗恒星公转？", options: ["月球", "太阳", "北极星", "火星"], correctIndex: 1 },
    { prompt: "下列哪一种动物属于哺乳动物？", options: ["企鹅", "海豚", "鳄鱼", "章鱼"], correctIndex: 1 },
    { prompt: "英文单词 apple 的中文含义是？", options: ["香蕉", "橙子", "苹果", "葡萄"], correctIndex: 2 },
    { prompt: "3 × 4 + 2 等于多少？", options: ["12", "14", "18", "20"], correctIndex: 1 },
  ];
}

function createStore(): PreviewStore {
  const questions = seedQuestions().map((question, index) => ({
    ...question,
    options: [...question.options],
    id: index + 1,
  }));

  return {
    quizzes: [
      {
        id: 1,
        code: "DEMO26",
        title: "周五小测 · 预览示例",
        description: "内存预览模式：关闭服务器后，新增题目和答卷会自动清空。",
        isPublished: true,
        createdAt: new Date().toISOString(),
        questions,
      },
    ],
    submissions: [],
    nextQuizId: 2,
    nextQuestionId: questions.length + 1,
    nextSubmissionId: 1,
    students: [{ studentId: "20260001", name: "Demo Student", active: true }],
    rosterImports: new Map(),
    qa: [],
    resources: [],
    nextQaId: 1,
    nextResourceId: 1,
  };
}

function store() {
  previewGlobal.__quizPreviewStore ||= createStore();
  return previewGlobal.__quizPreviewStore;
}

function generateCode() {
  const state = store();
  let code = "";
  do {
    code = "";
    for (let index = 0; index < 6; index += 1) {
      code += codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
    }
  } while (state.quizzes.some((quiz) => quiz.code === code));
  return code;
}

function copyQuestions(questions: QuestionInput[]) {
  const state = store();
  return questions.map((question) => ({
    id: state.nextQuestionId++,
    prompt: question.prompt,
    options: [...question.options],
    correctIndex: question.correctIndex,
  }));
}

export async function checkDatabase() {
  store();
  return true;
}

export async function createQuiz(input: QuizInput) {
  const state = store();
  const code = input.code?.trim().toUpperCase() || generateCode();
  if (state.quizzes.some((quiz) => quiz.code === code)) throw new Error("QUIZ_CODE_EXISTS");
  const quiz: PreviewQuiz = {
    id: state.nextQuizId++,
    code,
    title: input.title,
    description: input.description || "",
    isPublished: Boolean(input.published),
    createdAt: new Date().toISOString(),
    questions: copyQuestions(input.questions),
  };
  state.quizzes.push(quiz);
  return { id: quiz.id, code: quiz.code };
}

export async function listQuizzes() {
  const state = store();
  return [...state.quizzes]
    .sort((left, right) => right.id - left.id)
    .map((quiz) => ({
      id: quiz.id,
      code: quiz.code,
      title: quiz.title,
      description: quiz.description,
      isPublished: quiz.isPublished,
      createdAt: quiz.createdAt,
      questionCount: quiz.questions.length,
      submissionCount: state.submissions.filter((submission) => submission.quizId === quiz.id).length,
    }));
}

export async function getTeacherQuiz(id: number) {
  const quiz = store().quizzes.find((candidate) => candidate.id === id);
  if (!quiz) return null;
  return {
    id: quiz.id,
    code: quiz.code,
    title: quiz.title,
    description: quiz.description,
    isPublished: quiz.isPublished,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: [...question.options],
      correctIndex: question.correctIndex,
    })),
  };
}

export async function updateQuiz(id: number, input: QuizInput) {
  const state = store();
  const quiz = state.quizzes.find((candidate) => candidate.id === id);
  if (!quiz) throw new Error("QUIZ_NOT_FOUND");
  if (state.submissions.some((submission) => submission.quizId === id)) {
    throw new Error("QUIZ_HAS_SUBMISSIONS");
  }

  quiz.title = input.title;
  quiz.description = input.description || "";
  quiz.questions = copyQuestions(input.questions);
  return { id };
}

export async function deleteQuiz(id: number) {
  const state = store();
  const index = state.quizzes.findIndex((quiz) => quiz.id === id);
  if (index < 0) return 0;
  state.quizzes.splice(index, 1);
  state.submissions = state.submissions.filter((submission) => submission.quizId !== id);
  return 1;
}

export async function getPublicQuiz(code: string): Promise<PublicQuiz | null> {
  const quiz = store().quizzes.find(
    (candidate) => candidate.code === code.trim().toUpperCase() && candidate.isPublished,
  );
  if (!quiz) return null;
  return {
    code: quiz.code,
    title: quiz.title,
    description: quiz.description,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: [...question.options],
    })),
  };
}

export async function setQuizPublished(id: number, published: boolean) {
  const quiz = store().quizzes.find((candidate) => candidate.id === id);
  if (!quiz) return 0;
  quiz.isPublished = published;
  return 1;
}

export async function submitQuiz(
  code: string,
  studentId: string,
  nickname: string,
  answers: number[],
) {
  const state = store();
  const quiz = state.quizzes.find(
    (candidate) => candidate.code === code.toUpperCase() && candidate.isPublished,
  );
  if (!quiz) throw new Error("QUIZ_NOT_FOUND");

  if (
    state.submissions.some(
      (submission) =>
        submission.quizId === quiz.id &&
        submission.studentId.toLocaleLowerCase() === studentId.toLocaleLowerCase(),
    )
  ) {
    throw new Error("ALREADY_SUBMITTED");
  }

  if (
    answers.length !== quiz.questions.length ||
    answers.some((answer) => !Number.isInteger(answer))
  ) {
    throw new Error("INVALID_ANSWERS");
  }

  const correctness = quiz.questions.map(
    (question, index) => question.correctIndex === answers[index],
  );
  const score = correctness.filter(Boolean).length;
  const submission: PreviewSubmission = {
    id: state.nextSubmissionId++,
    quizId: quiz.id,
    studentId,
    nickname,
    score,
    total: quiz.questions.length,
    answers: [...answers],
    correctness,
    submittedAt: new Date().toISOString(),
  };
  state.submissions.push(submission);

  return {
    submissionId: submission.id,
    score,
    total: submission.total,
    correctness: [...correctness],
  };
}

export async function getLeaderboard(code: string) {
  const state = store();
  const quiz = state.quizzes.find(
    (candidate) => candidate.code === code.toUpperCase() && candidate.isPublished,
  );
  if (!quiz) return null;

  const entries = state.submissions
    .filter((submission) => submission.quizId === quiz.id)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.submittedAt.localeCompare(right.submittedAt),
    )
    .map((submission) => ({
      nickname: submission.nickname,
      score: submission.score,
      total: submission.total,
      submittedAt: submission.submittedAt,
    }));

  return { title: quiz.title, entries };
}

export async function getQuizResults(id: number): Promise<QuizResults | null> {
  const state = store();
  const quiz = state.quizzes.find((candidate) => candidate.id === id);
  if (!quiz) return null;

  const submissions = state.submissions
    .filter((submission) => submission.quizId === id)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.submittedAt.localeCompare(right.submittedAt),
    )
    .map((submission) => ({
      id: submission.id,
      studentId: submission.studentId,
      nickname: submission.nickname,
      score: submission.score,
      total: submission.total,
      submittedAt: submission.submittedAt,
    }));

  return {
    quiz: { id: quiz.id, code: quiz.code, title: quiz.title },
    statistics: {
      submissionCount: submissions.length,
      averageScore: submissions.length ? submissions.reduce((sum, item) => sum + item.score, 0) / submissions.length : 0,
      averageAccuracy: submissions.length && quiz.questions.length ? submissions.reduce((sum, item) => sum + item.score, 0) / (submissions.length * quiz.questions.length) : 0,
      questions: quiz.questions.map((question, index) => {
        const correctCount = submissions.filter((submission) => {
          const original = state.submissions.find((candidate) => candidate.id === submission.id);
          return Boolean(original?.correctness[index]);
        }).length;
        return { questionId: question.id, prompt: question.prompt, correctCount, responseCount: submissions.length, accuracy: submissions.length ? correctCount / submissions.length : 0 };
      }),
    },
    submissions,
  };
}

export async function deleteSubmission(id: number) {
  const state = store();
  const index = state.submissions.findIndex((submission) => submission.id === id);
  if (index < 0) return 0;
  state.submissions.splice(index, 1);
  return 1;
}

export async function authenticateStudent(studentId: string, password: string) {
  const student = store().students.find((item) => item.active && item.studentId.toLowerCase() === studentId.toLowerCase());
  if (!student || password !== `${student.studentId}2605`) return null;
  return { studentId: student.studentId, name: student.name };
}

export async function getStudent(studentId: string) {
  const student = store().students.find((item) => item.active && item.studentId.toLowerCase() === studentId.toLowerCase());
  return student ? { studentId: student.studentId, name: student.name } : null;
}

function normalizeRoster(students: RosterStudent[]) {
  const unique = new Map<string, RosterStudent>();
  for (const student of students) unique.set(student.studentId.toLowerCase(), { studentId: student.studentId.trim(), name: student.name.trim() });
  return [...unique.values()];
}

export async function previewRoster(students: RosterStudent[]) {
  const state = store(); const incoming = normalizeRoster(students);
  const currentMap = new Map(state.students.map((item) => [item.studentId.toLowerCase(), item]));
  const keys = new Set(incoming.map((item) => item.studentId.toLowerCase()));
  const add = incoming.filter((item) => !currentMap.has(item.studentId.toLowerCase()));
  const update = incoming.flatMap((item) => { const old = currentMap.get(item.studentId.toLowerCase()); return old && (old.name !== item.name || !old.active) ? [{ ...item, previousName: old.name }] : []; });
  const deactivate = state.students.filter((item) => item.active && !keys.has(item.studentId.toLowerCase())).map(({ studentId, name }) => ({ studentId, name }));
  const token = randomUUID(); state.rosterImports.set(token, incoming);
  return { token, total: incoming.length, add, update, deactivate, unchanged: incoming.length - add.length - update.length };
}

export async function syncRoster(token: string) {
  const state = store(); const students = state.rosterImports.get(token); if (!students) throw new Error("ROSTER_IMPORT_EXPIRED");
  const keys = new Set(students.map((item) => item.studentId.toLowerCase()));
  state.students.forEach((item) => { if (!keys.has(item.studentId.toLowerCase())) item.active = false; });
  for (const student of students) { const existing = state.students.find((item) => item.studentId.toLowerCase() === student.studentId.toLowerCase()); if (existing) Object.assign(existing, { name: student.name, active: true }); else state.students.push({ ...student, active: true }); }
  state.rosterImports.delete(token); return { active: students.length };
}

export async function getGradebook(): Promise<Gradebook> {
  const state = store();
  return {
    quizzes: state.quizzes.map((quiz) => ({
      id: quiz.id,
      code: quiz.code,
      title: quiz.title,
      total: quiz.questions.length,
    })),
    students: [...state.students]
      .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name) || left.studentId.localeCompare(right.studentId))
      .map((student) => ({
        studentId: student.studentId,
        name: student.name,
        active: student.active,
        scores: state.submissions
          .filter((submission) => submission.studentId.toLowerCase() === student.studentId.toLowerCase())
          .map((submission) => ({
            quizId: submission.quizId,
            score: submission.score,
            total: submission.total,
            submittedAt: submission.submittedAt,
          })),
      })),
  };
}

export async function listQa(teacher = false): Promise<QaItem[]> {
  return [...store().qa].reverse().map((item) => ({ ...item, studentId: teacher ? item.studentId : undefined }));
}

export async function createQa(studentId: string, question: string, imageKey?: string | null, guestName?: string) {
  const state = store(); const student = guestName ? { studentId, name: guestName } : await getStudent(studentId); if (!student) throw new Error("STUDENT_NOT_FOUND");
  const item = { id: state.nextQaId++, studentId: student.studentId, studentName: student.name, question, imageKey, answer: null, createdAt: new Date().toISOString(), answeredAt: null };
  state.qa.push(item); return { id: item.id };
}

export async function answerQa(id: number, answer: string) {
  const item = store().qa.find((candidate) => candidate.id === id); if (!item) return 0; item.answer = answer; item.answeredAt = new Date().toISOString(); return 1;
}

export async function listResources(): Promise<ResourceItem[]> { return [...store().resources].reverse().map((item) => ({ id:item.id,title:item.title,filename:item.filename,mimeType:item.mimeType,size:item.size,createdAt:item.createdAt })); }
export async function createResource(title: string, filename: string, mimeType: string, size: number, objectKey: string) { const state = store(); const item = { id: state.nextResourceId++, title, filename, mimeType, size, objectKey, createdAt: new Date().toISOString() }; state.resources.push(item); return { id: item.id }; }
export async function getResource(id: number): Promise<(ResourceItem & { objectKey:string }) | null> { return store().resources.find((item) => item.id === id) || null; }
export async function deleteResource(id: number) { const state = store(); const index = state.resources.findIndex((item) => item.id === id); if (index < 0) return null; const [item] = state.resources.splice(index, 1); return { objectKey: item.objectKey }; }
