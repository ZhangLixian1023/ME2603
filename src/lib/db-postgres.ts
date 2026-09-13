import "server-only";

import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "./auth";
import type { PublicQuiz, QuestionInput, QuizInput, QuizResults, RosterStudent, QaItem, ResourceItem } from "./db-types";

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

    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS roster_imports (
        token TEXT PRIMARY KEY,
        students_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS qa_posts (
        id BIGSERIAL PRIMARY KEY,
        student_id TEXT REFERENCES students(student_id) ON DELETE SET NULL,
        student_name TEXT NOT NULL,
        question TEXT NOT NULL,
        image_key TEXT,
        answer TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        answered_at TIMESTAMPTZ
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS resources (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    await sql`CREATE INDEX IF NOT EXISTS questions_quiz_position_idx ON questions (quiz_id, position)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS submissions_quiz_student_unique ON submissions (quiz_id, lower(student_id))`;
    await sql`CREATE INDEX IF NOT EXISTS submissions_leaderboard_idx ON submissions (quiz_id, score DESC, submitted_at ASC)`;
    await sql`CREATE INDEX IF NOT EXISTS qa_posts_created_idx ON qa_posts (created_at DESC)`;
    await sql`DELETE FROM submissions WHERE submitted_at < NOW() - (${retentionDays} * INTERVAL '1 day')`;
    await sql`DELETE FROM roster_imports WHERE created_at < NOW() - INTERVAL '1 hour'`;

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

  const customCode = input.code?.trim().toUpperCase();
  if (customCode) {
    try {
      return await insertPostgresQuiz(pg(), input, customCode);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("QUIZ_CODE_EXISTS");
      throw error;
    }
  }

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
      submitted_at AS "submittedAt",
      correctness_json AS "correctnessJson"
    FROM submissions
    WHERE quiz_id = ${id}
    ORDER BY score DESC, submitted_at ASC`;

  const questions = await pg()`SELECT id, prompt FROM questions WHERE quiz_id = ${id} ORDER BY position`;
  const correctnessRows = submissions.map((submission) => Array.isArray(submission.correctnessJson) ? submission.correctnessJson.map(Boolean) : JSON.parse(String(submission.correctnessJson)).map(Boolean));
  const submissionCount = submissions.length;
  const totalScore = submissions.reduce((sum, submission) => sum + Number(submission.score), 0);
  const totalQuestions = questions.length;
  return {
    quiz: {
      id: Number(quiz.id),
      code: String(quiz.code),
      title: String(quiz.title),
    },
    statistics: {
      submissionCount,
      averageScore: submissionCount ? totalScore / submissionCount : 0,
      averageAccuracy: submissionCount && totalQuestions ? totalScore / (submissionCount * totalQuestions) : 0,
      questions: questions.map((question, index) => {
        const correctCount = correctnessRows.filter((row) => row[index]).length;
        return { questionId: Number(question.id), prompt: String(question.prompt), correctCount, responseCount: submissionCount, accuracy: submissionCount ? correctCount / submissionCount : 0 };
      }),
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

export async function authenticateStudent(studentId: string, password: string) {
  await ensurePostgres();
  const [student] = await pg()`SELECT student_id AS "studentId", name, password_hash AS "passwordHash", password_salt AS "passwordSalt" FROM students WHERE lower(student_id) = lower(${studentId}) AND active = TRUE`;
  if (!student || !verifyPassword(password, String(student.passwordSalt), String(student.passwordHash))) return null;
  return { studentId: String(student.studentId), name: String(student.name) };
}

export async function getStudent(studentId: string) {
  await ensurePostgres();
  const [student] = await pg()`SELECT student_id AS "studentId", name FROM students WHERE lower(student_id) = lower(${studentId}) AND active = TRUE`;
  return student ? { studentId: String(student.studentId), name: String(student.name) } : null;
}

function normalizeRoster(students: RosterStudent[]) {
  const unique = new Map<string, RosterStudent>();
  for (const student of students) unique.set(student.studentId.toLowerCase(), { studentId: student.studentId.trim(), name: student.name.trim() });
  return [...unique.values()];
}

export async function previewRoster(students: RosterStudent[]) {
  await ensurePostgres();
  const incoming = normalizeRoster(students);
  const current = await pg()`SELECT student_id AS "studentId", name, active FROM students`;
  const currentMap = new Map(current.map((item) => [String(item.studentId).toLowerCase(), item]));
  const incomingKeys = new Set(incoming.map((item) => item.studentId.toLowerCase()));
  const add = incoming.filter((item) => !currentMap.has(item.studentId.toLowerCase()));
  const update = incoming.flatMap((item) => {
    const old = currentMap.get(item.studentId.toLowerCase());
    return old && (String(old.name) !== item.name || !old.active) ? [{ ...item, previousName: String(old.name) }] : [];
  });
  const deactivate = current.filter((item) => item.active && !incomingKeys.has(String(item.studentId).toLowerCase())).map((item) => ({ studentId: String(item.studentId), name: String(item.name) }));
  const token = randomUUID();
  await pg()`INSERT INTO roster_imports (token, students_json) VALUES (${token}, ${pg().json(incoming)})`;
  return { token, total: incoming.length, add, update, deactivate, unchanged: incoming.length - add.length - update.length };
}

export async function syncRoster(token: string) {
  await ensurePostgres();
  return pg().begin(async (tx) => {
    const [draft] = await tx`DELETE FROM roster_imports WHERE token = ${token} AND created_at >= NOW() - INTERVAL '1 hour' RETURNING students_json AS "studentsJson"`;
    if (!draft) throw new Error("ROSTER_IMPORT_EXPIRED");
    const students = (Array.isArray(draft.studentsJson) ? draft.studentsJson : JSON.parse(String(draft.studentsJson))) as RosterStudent[];
    const ids = students.map((student) => student.studentId.toLowerCase());
    if (ids.length) await tx`UPDATE students SET active = FALSE, updated_at = NOW() WHERE active = TRUE AND lower(student_id) NOT IN ${tx(ids)}`;
    else await tx`UPDATE students SET active = FALSE, updated_at = NOW() WHERE active = TRUE`;
    for (const student of students) {
      const existing = await tx`SELECT student_id FROM students WHERE lower(student_id) = lower(${student.studentId})`;
      if (existing.length) {
        await tx`UPDATE students SET name = ${student.name}, active = TRUE, updated_at = NOW() WHERE lower(student_id) = lower(${student.studentId})`;
      } else {
        const password = hashPassword(`${student.studentId}2605`);
        await tx`INSERT INTO students (student_id, name, password_hash, password_salt) VALUES (${student.studentId}, ${student.name}, ${password.hash}, ${password.salt})`;
      }
    }
    return { active: students.length };
  });
}

export async function listQa(teacher = false): Promise<QaItem[]> {
  await ensurePostgres();
  const rows = await pg()`SELECT id, student_id AS "studentId", student_name AS "studentName", question, image_key AS "imageKey", answer, created_at AS "createdAt", answered_at AS "answeredAt" FROM qa_posts ORDER BY created_at DESC`;
  return rows.map((row) => ({ id:Number(row.id), studentId:teacher?String(row.studentId||""):undefined, studentName:String(row.studentName), question:String(row.question), imageKey:row.imageKey?String(row.imageKey):null, answer:row.answer?String(row.answer):null, createdAt:String(row.createdAt), answeredAt:row.answeredAt?String(row.answeredAt):null }));
}

export async function createQa(studentId: string, question: string, imageKey?: string | null, guestName?: string) {
  await ensurePostgres();
  if (guestName) {
    const [row] = await pg()`INSERT INTO qa_posts (student_id, student_name, question, image_key) VALUES (NULL, ${guestName}, ${question}, ${imageKey || null}) RETURNING id`;
    return { id: Number(row.id) };
  }
  const student = await getStudent(studentId); if (!student) throw new Error("STUDENT_NOT_FOUND");
  const [row] = await pg()`INSERT INTO qa_posts (student_id, student_name, question, image_key) VALUES (${student.studentId}, ${student.name}, ${question}, ${imageKey || null}) RETURNING id`;
  return { id: Number(row.id) };
}

export async function answerQa(id: number, answer: string) {
  await ensurePostgres();
  const rows = await pg()`UPDATE qa_posts SET answer = ${answer}, answered_at = NOW() WHERE id = ${id} RETURNING id`;
  return rows.length;
}

export async function listResources(): Promise<ResourceItem[]> {
  await ensurePostgres();
  const rows = await pg()`SELECT id, title, filename, mime_type AS "mimeType", size_bytes AS size, created_at AS "createdAt" FROM resources ORDER BY created_at DESC`;
  return rows.map((row) => ({ id:Number(row.id), title:String(row.title), filename:String(row.filename), mimeType:String(row.mimeType), size:Number(row.size), createdAt:String(row.createdAt) }));
}

export async function createResource(title: string, filename: string, mimeType: string, size: number, objectKey: string) {
  await ensurePostgres();
  const [row] = await pg()`INSERT INTO resources (title, filename, mime_type, size_bytes, object_key) VALUES (${title}, ${filename}, ${mimeType}, ${size}, ${objectKey}) RETURNING id`;
  return { id: Number(row.id) };
}

export async function getResource(id: number): Promise<(ResourceItem & { objectKey: string }) | null> {
  await ensurePostgres();
  const [row] = await pg()`SELECT id, title, filename, mime_type AS "mimeType", size_bytes AS size, object_key AS "objectKey", created_at AS "createdAt" FROM resources WHERE id = ${id}`;
  return row ? { id:Number(row.id), title:String(row.title), filename:String(row.filename), mimeType:String(row.mimeType), size:Number(row.size), objectKey:String(row.objectKey), createdAt:String(row.createdAt) } : null;
}

export async function deleteResource(id: number) {
  await ensurePostgres();
  const [row] = await pg()`DELETE FROM resources WHERE id = ${id} RETURNING object_key AS "objectKey"`;
  return row ? { objectKey: String(row.objectKey) } : null;
}
