export type QuestionInput = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type QuizInput = {
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
  submissions: Array<{
    id: number;
    studentId: string;
    nickname: string;
    score: number;
    total: number;
    submittedAt: string;
  }>;
};
