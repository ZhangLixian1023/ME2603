export type QuestionInput = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type QuizInput = {
  code?: string;
  title: string;
  description?: string;
  questions: QuestionInput[];
  published?: boolean;
};

export type PublicQuiz = {
  code: string;
  title: string;
  description: string;
  questions: Array<{ id: number; prompt: string; options: string[] }>;
};

export type QuizResults = {
  quiz: { id: number; code: string; title: string };
  statistics: {
    submissionCount: number;
    averageScore: number;
    averageAccuracy: number;
    questions: Array<{ questionId: number; prompt: string; correctCount: number; responseCount: number; accuracy: number }>;
  };
  submissions: Array<{
    id: number;
    studentId: string;
    nickname: string;
    score: number;
    total: number;
    submittedAt: string;
  }>;
};

export type RosterStudent = { studentId: string; name: string };
export type RosterPreview = {
  token: string;
  total: number;
  add: RosterStudent[];
  update: Array<RosterStudent & { previousName: string }>;
  deactivate: RosterStudent[];
  unchanged: number;
};

export type QaItem = {
  id: number;
  studentId?: string;
  studentName: string;
  question: string;
  imageKey?: string | null;
  answer?: string | null;
  createdAt: string;
  answeredAt?: string | null;
};

export type ResourceItem = {
  id: number;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
