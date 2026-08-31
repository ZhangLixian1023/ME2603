import "server-only";

import type { PublicQuiz, QuestionInput, QuizInput, QuizResults } from "./db-types";

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
  const quiz: PreviewQuiz = {
    id: state.nextQuizId++,
    code: generateCode(),
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
