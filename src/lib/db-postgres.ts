import "server-only";

import postgres, { type Sql } from "postgres";
import type { PublicQuiz, QuestionInput, QuizInput, QuizResults } from "./db-types";

const retentionDays = Math.max(1, Number(process.env.DATA_RETENTION_DAYS) || 365);
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let postgresClient: Sql | null = null;
let postgresReady: Promise<void> | null = null;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (value) return value;

  const host = process.env.PGHOST?.trim();
  const database = process.env.PGDATABASE?.trim();
  const username = process.env.PGUSER?.trim();
  const password = process.env.PGPASSWORD;
  const port = Number(process.env.PGPORT) || 5432;

  if (!host || !database || !username || !password) {
    throw new Error(
      "PostgreSQL must be configured with DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD.",
    );
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function poolSize() {
  return Math.min(50, Math.max(1, Number(process.env.DATABASE_POOL_MAX) || 20));
}

function pg() {
  postgresClient ||= postgres(databaseUrl(), {
    max: poolSize(),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return postgresClient;
}

function generateCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
  }
  return code;
}

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return JSON.parse(String(value)) as string[];
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function seedQuestions(): QuestionInput[] {
  return [
    { prompt: "水在标准大气压下的沸点是多少？", options: ["0°C", "50°C", "100°C", "120°C"], correctIndex: 2 },
    { prompt: "地球绕哪一颗恒星公转？", options: ["月球", "太阳", "北极星", "火星"], correctIndex: 1 },
    { prompt: "下列哪一种动物属于哺乳动物？", options: ["企鹅", "海豚", "鳄鱼", "章鱼"], correctIndex: 1 },
    { prompt: "英文单词 apple 的中文含义是？", options: ["香蕉", "橙子", "苹果", "葡萄"], correctIndex: 2 },
    { prompt: "3 × 4 + 2 等于多少？", options: ["12", "14", "18", "20"], correctIndex: 1 },
  ];
}

async function ensurePostgres() {
  if (postgresReady) return postgresReady;

  postgresReady = (async () => {
    const sql = pg();

    await sql`
      CREATE TABLE IF NOT EXISTS quizzes (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS questions (
        id BIGSERIAL PRIMARY KEY,
        quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        options_json JSONB NOT NULL,
        correct_index INTEGER NOT NULL,
        position INTEGER NOT NULL
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id BIGSERIAL PRIMARY KEY,
        quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        answers_json JSONB NOT NULL,
        correctness_json JSONB NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`CREATE INDEX IF NOT EXISTS questions_quiz_position_idx ON questions (quiz_id, position)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS submissions_quiz_student_unique ON submissions (quiz_id, lower(student_id))`;
    await sql`CREATE INDEX IF NOT EXISTS submissions_leaderboard_idx ON submissions (quiz_id, score DESC, submitted_at ASC)`;
    await sql`DELETE FROM submissions WHERE submitted_at < NOW() - (${retentionDays} * INTERVAL '1 day')`;

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM quizzes`;
    if (Number(count) === 0) {
      try {
        await insertPostgresQuiz(
          sql,
          {
            title: "周五小测 · 示例",
            description: "5 道轻松的常识题，体验完整答题流程。",
            questions: seedQuestions(),
            published: true,
          },
          "DEMO26",
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  })().catch((error) => {
    postgresReady = null;
    throw error;
  });

  return postgresReady;
}

async function insertPostgresQuiz(sql: Sql, input: QuizInput, code = generateCode()) {
  return sql.begin(async (tx) => {
    const [quiz] = await tx`
      INSERT INTO quizzes (code, title, description, is_published)
      VALUES (${code}, ${input.title}, ${input.description || ""}, ${Boolean(input.published)})
      RETURNING id, code`;

    for (let index = 0; index < input.questions.length; index += 1) {
      const question = input.questions[index];
      await tx`
        INSERT INTO questions (quiz_id, prompt, options_json, correct_index, position)
        VALUES (${quiz.id}, ${question.prompt}, ${tx.json(question.options)}, ${question.correctIndex}, ${index})`;
    }

    return { id: Number(quiz.id), code: String(quiz.code) };
  });
}

export async function checkDatabase() {
  await ensurePostgres();
  const [result] = await pg()`SELECT 1::int AS ok`;
  return Number(result.ok) === 1;
}

export async function createQuiz(input: QuizInput) {
  await ensurePostgres();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await insertPostgresQuiz(pg(), input);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }

  throw new Error("QUIZ_CODE_GENERATION_FAILED");
}

export async function listQuizzes() {
  await ensurePostgres();
  const rows = await pg()`
    SELECT
      q.id,
      q.code,
      q.title,
      q.description,
      q.is_published AS "isPublished",
      q.created_at AS "createdAt",
      COUNT(DISTINCT qu.id)::int AS "questionCount",
      COUNT(DISTINCT s.id)::int AS "submissionCount"
    FROM quizzes q
    LEFT JOIN questions qu ON qu.quiz_id = q.id
    LEFT JOIN submissions s ON s.quiz_id = q.id
    GROUP BY q.id
    ORDER BY q.id DESC`;

  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

export async function getTeacherQuiz(id: number) {
  await ensurePostgres();
  const [quiz] = await pg()`
    SELECT id, code, title, description, is_published AS "isPublished"
    FROM quizzes
    WHERE id = ${id}`;

  if (!quiz) return null;

  const questions = await pg()`
    SELECT id, prompt, options_json AS "optionsJson", correct_index AS "correctIndex"
    FROM questions
    WHERE quiz_id = ${id}
    ORDER BY position`;

  return {
    ...quiz,
    id: Number(quiz.id),
    questions: questions.map((question) => ({
      ...question,
      id: Number(question.id),
      options: normalizeOptions(question.optionsJson),
    })),
  };
}

export async function updateQuiz(id: number, input: QuizInput) {
  await ensurePostgres();

  return pg().begin(async (tx) => {
    const [{ count }] = await tx`SELECT COUNT(*)::int AS count FROM submissions WHERE quiz_id = ${id}`;
    if (Number(count) > 0) throw new Error("QUIZ_HAS_SUBMISSIONS");

    const changed = await tx`
      UPDATE quizzes
      SET title = ${input.title}, description = ${input.description || ""}
      WHERE id = ${id}
      RETURNING id`;
    if (!changed.length) throw new Error("QUIZ_NOT_FOUND");

    await tx`DELETE FROM questions WHERE quiz_id = ${id}`;
    for (let index = 0; index < input.questions.length; index += 1) {
      const question = input.questions[index];
      await tx`
        INSERT INTO questions (quiz_id, prompt, options_json, correct_index, position)
        VALUES (${id}, ${question.prompt}, ${tx.json(question.options)}, ${question.correctIndex}, ${index})`;
    }

    return { id };
  });
}

export async function deleteQuiz(id: number) {
  await ensurePostgres();
  const rows = await pg()`DELETE FROM quizzes WHERE id = ${id} RETURNING id`;
  return rows.length;
}

export async function getPublicQuiz(code: string): Promise<PublicQuiz | null> {
  await ensurePostgres();
  const [quiz] = await pg()`
    SELECT id, code, title, description
    FROM quizzes
    WHERE code = ${code.trim().toUpperCase()} AND is_published = TRUE`;

  if (!quiz) return null;

  const questions = await pg()`
    SELECT id, prompt, options_json AS "optionsJson"
    FROM questions
    WHERE quiz_id = ${quiz.id}
    ORDER BY position`;

  return {
    code: String(quiz.code),
    title: String(quiz.title),
    description: String(quiz.description),
    questions: questions.map((question) => ({
      id: Number(question.id),
      prompt: String(question.prompt),
      options: normalizeOptions(question.optionsJson),
    })),
  };
}

export async function setQuizPublished(id: number, published: boolean) {
  await ensurePostgres();
  const rows = await pg()`
    UPDATE quizzes
    SET is_published = ${published}
    WHERE id = ${id}
    RETURNING id`;
  return rows.length;
}

export async function submitQuiz(code: string, studentId: string, nickname: string, answers: number[]) {
  await ensurePostgres();

  try {
    return await pg().begin(async (tx) => {
      const [quiz] = await tx`
        SELECT id
        FROM quizzes
        WHERE code = ${code.toUpperCase()} AND is_published = TRUE`;
      if (!quiz) throw new Error("QUIZ_NOT_FOUND");

      const questions = await tx`
        SELECT correct_index AS "correctIndex"
        FROM questions
        WHERE quiz_id = ${quiz.id}
        ORDER BY position`;

      if (answers.length !== questions.length || answers.some((answer) => !Number.isInteger(answer))) {
        throw new Error("INVALID_ANSWERS");
      }

      const correctness = questions.map(
        (question, index) => Number(question.correctIndex) === answers[index],
      );
      const score = correctness.filter(Boolean).length;

      const [row] = await tx`
        INSERT INTO submissions (
          quiz_id, student_id, nickname, score, total, answers_json, correctness_json
        )
        VALUES (
          ${quiz.id}, ${studentId}, ${nickname}, ${score}, ${questions.length},
          ${tx.json(answers)}, ${tx.json(correctness)}
        )
        RETURNING id`;

      return {
        submissionId: Number(row.id),
        score,
        total: questions.length,
        correctness,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("ALREADY_SUBMITTED");
    throw error;
  }
}

export async function getLeaderboard(code: string) {
  await ensurePostgres();
  const [quiz] = await pg()`
    SELECT id, title
    FROM quizzes
    WHERE code = ${code.toUpperCase()} AND is_published = TRUE`;
  if (!quiz) return null;

  const entries = await pg()`
    SELECT nickname, score, total, submitted_at AS "submittedAt"
    FROM submissions
    WHERE quiz_id = ${quiz.id}
    ORDER BY score DESC, submitted_at ASC`;

  return { title: String(quiz.title), entries };
}

export async function getQuizResults(id: number): Promise<QuizResults | null> {
  await ensurePostgres();
  const [quiz] = await pg()`SELECT id, code, title FROM quizzes WHERE id = ${id}`;
  if (!quiz) return null;

  const submissions = await pg()`
    SELECT
      id,
      student_id AS "studentId",
      nickname,
      score,
      total,
      submitted_at AS "submittedAt"
    FROM submissions
    WHERE quiz_id = ${id}
    ORDER BY score DESC, submitted_at ASC`;

  return {
    quiz: {
      id: Number(quiz.id),
      code: String(quiz.code),
      title: String(quiz.title),
    },
    submissions: submissions.map((submission) => ({
      id: Number(submission.id),
      studentId: String(submission.studentId),
      nickname: String(submission.nickname),
      score: Number(submission.score),
      total: Number(submission.total),
      submittedAt: String(submission.submittedAt),
    })),
  };
}

export async function deleteSubmission(id: number) {
  await ensurePostgres();
  const rows = await pg()`DELETE FROM submissions WHERE id = ${id} RETURNING id`;
  return rows.length;
}
