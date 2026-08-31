const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const data = await response.json();
  return { response, data };
}

let quizId = null;
let cookie = "";

try {
  const login = await json("/api/teacher/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: process.env.TEACHER_PASSWORD || "teacher123" }),
  });
  assert(login.response.ok, "教师登录失败");
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";

  const created = await json("/api/teacher/quizzes", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "自动化验收测验", description: "临时数据", published: true, questions: [{ prompt: "1 + 1 = ?", options: ["1", "2", "3", "4"], correctIndex: 1 }] }),
  });
  assert(created.response.status === 201, "创建并发布失败");
  quizId = created.data.quiz.id;
  const code = created.data.quiz.code;

  const edited = await json(`/api/teacher/quizzes/${quizId}`, {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "自动化验收测验（已编辑）", description: "临时数据", questions: [{ prompt: "2 + 2 = ?", options: ["2", "3", "4", "5"], correctIndex: 2 }] }),
  });
  assert(edited.response.ok, "编辑测验失败");

  const publicQuiz = await json(`/api/quizzes/${code}`);
  assert(publicQuiz.response.ok && !JSON.stringify(publicQuiz.data).includes("correctIndex"), "学生接口泄露答案或读取失败");

  const submitted = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "SMOKE001", nickname: "自动测试", answers: [2] }),
  });
  assert(submitted.response.ok && submitted.data.score === 1, "自动判分失败");

  const duplicate = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "smoke001", nickname: "重复测试", answers: [2] }),
  });
  assert(duplicate.response.status === 409, "重复学号未被拦截");

  const board = await json(`/api/quizzes/${code}/leaderboard`);
  assert(board.response.ok && board.data.entries[0]?.nickname === "自动测试" && !JSON.stringify(board.data).includes("studentId"), "排行榜数据不正确");

  const results = await json(`/api/teacher/quizzes/${quizId}/results`, { headers: { cookie } });
  assert(results.response.ok && results.data.submissions[0]?.studentId === "SMOKE001", "教师成绩读取失败");

  const csv = await fetch(`${base}/api/teacher/quizzes/${quizId}/export`, { headers: { cookie } });
  assert(csv.ok && (await csv.text()).includes("SMOKE001"), "CSV 导出失败");
  console.log("✓ 登录、创建发布、编辑、答题、判分、重复拦截、排行榜、教师成绩与 CSV 导出均通过");
} finally {
  if (quizId && cookie) {
    await fetch(`${base}/api/teacher/quizzes/${quizId}`, { method: "DELETE", headers: { cookie } });
  }
}
