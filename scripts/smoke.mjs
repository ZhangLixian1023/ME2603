const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

if (!process.env.TEACHER_PASSWORD) {
  console.error("Set TEACHER_PASSWORD env var to run smoke test (it must match the server's password).");
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const data = await response.json();
  return { response, data };
}

let quizId = null;
let resourceId = null;
let cookie = "";
let studentCookie = "";
let guestCookie = "";

try {
  const privateGradebook = await json("/api/teacher/gradebook");
  assert(privateGradebook.response.status === 401, "未登录用户可以读取学生成绩册");

  const login = await json("/api/teacher/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: process.env.TEACHER_PASSWORD }),
  });
  assert(login.response.ok, "教师登录失败");
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";

  const studentLogin = await json("/api/student/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "20260001", password: "202600012605" }),
  });
  assert(studentLogin.response.ok && studentLogin.data.student?.name === "Demo Student", "学生登录失败");
  studentCookie = studentLogin.response.headers.get("set-cookie")?.split(";")[0] || "";

  const registeredIdGuestAttempt = await json("/api/student/guest-login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "20260001", name: "冒用测试" }),
  });
  assert(registeredIdGuestAttempt.response.status === 409, "注册学生学号可被旁听生入口绕过");

  const guestId = `audit${Date.now().toString(36)}`;
  const guestLogin = await json("/api/student/guest-login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: guestId, name: "Audit Student" }),
  });
  assert(guestLogin.response.ok && guestLogin.data.student?.isGuest === true, "旁听生登录失败");
  guestCookie = guestLogin.response.headers.get("set-cookie")?.split(";")[0] || "";

  const customCodeInput = `smoke${Date.now().toString(36)}`;
  const created = await json("/api/teacher/quizzes", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ code: customCodeInput, title: "自动化验收测验", description: "临时数据", published: true, questions: [{ prompt: "1 + 1 = ?", options: ["1", "2", "3", "4"], correctIndex: 1 }] }),
  });
  assert(created.response.status === 201, "创建并发布失败");
  quizId = created.data.quiz.id;
  const code = created.data.quiz.code;
  assert(code === customCodeInput.toUpperCase(), "自定义测验代码未正确保存");

  const duplicateCode = await json("/api/teacher/quizzes", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ code: customCodeInput, title: "重复代码测试", published: false, questions: [{ prompt: "1 + 1 = ?", options: ["1", "2"], correctIndex: 1 }] }),
  });
  assert(duplicateCode.response.status === 409, "重复的自定义测验代码未被拦截");

  const edited = await json(`/api/teacher/quizzes/${quizId}`, {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "自动化验收测验（已编辑）", description: "临时数据", questions: [{ prompt: "2 + 2 = ?", options: ["2", "3", "4", "5"], correctIndex: 2 }] }),
  });
  assert(edited.response.ok, "编辑测验失败");

  const publicQuiz = await json(`/api/quizzes/${code}`, { headers: { cookie: studentCookie } });
  assert(publicQuiz.response.ok && !JSON.stringify(publicQuiz.data).includes("correctIndex"), "学生接口泄露答案或读取失败");

  const guestPublicQuiz = await json(`/api/quizzes/${code}`, { headers: { cookie: guestCookie } });
  assert(guestPublicQuiz.response.ok && !JSON.stringify(guestPublicQuiz.data).includes("correctIndex"), "旁听生无法读取测验或接口泄露答案");

  const submitted = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "content-type": "application/json", cookie: studentCookie },
    body: JSON.stringify({ answers: [2] }),
  });
  assert(submitted.response.ok && submitted.data.score === 1, "自动判分失败");

  const duplicate = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "content-type": "application/json", cookie: studentCookie },
    body: JSON.stringify({ answers: [2] }),
  });
  assert(duplicate.response.status === 409, "重复学号未被拦截");

  const guestSubmission = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "content-type": "application/json", cookie: guestCookie },
    body: JSON.stringify({ answers: [2] }),
  });
  assert(guestSubmission.response.ok && guestSubmission.data.score === 1, "旁听生提交或自动判分失败");

  const board = await json(`/api/quizzes/${code}/leaderboard`);
  assert(board.response.ok && board.data.entries.some((entry) => entry.nickname === "Demo Student") && board.data.entries.some((entry) => entry.nickname === "Audit Student") && !JSON.stringify(board.data).includes("studentId"), "排行榜数据不正确");

  const results = await json(`/api/teacher/quizzes/${quizId}/results`, { headers: { cookie } });
  assert(results.response.ok && results.data.submissions.some((item) => item.studentId === "20260001") && results.data.submissions.some((item) => item.studentId === guestId) && results.data.statistics?.averageAccuracy === 1, "教师成绩或统计读取失败");

  const gradebook = await json("/api/teacher/gradebook", { headers: { cookie } });
  const gradebookStudent = gradebook.data.students?.find((item) => item.studentId === "20260001");
  assert(
    gradebook.response.ok &&
      gradebook.data.quizzes?.some((quiz) => quiz.id === quizId) &&
      gradebookStudent?.scores.some((score) => score.quizId === quizId && score.score === 1 && score.total === 1) &&
      !gradebook.data.students?.some((item) => item.studentId === guestId),
    "学生成绩册数据或访问控制不正确",
  );

  const resourceForm = new FormData();
  resourceForm.set("title", "自动化验收资料");
  resourceForm.set(
    "file",
    new File(["# Smoke test resource\n"], "smoke-test.md", { type: "text/markdown" }),
  );
  const resourceUpload = await json("/api/teacher/resources", {
    method: "POST",
    headers: { cookie },
    body: resourceForm,
  });
  assert(resourceUpload.response.status === 201, "课程资料上传失败");
  resourceId = resourceUpload.data.item.id;
  const resourceDownload = await fetch(`${base}/api/resources/${resourceId}/download`, { headers: { cookie } });
  assert(resourceDownload.ok && (await resourceDownload.text()).includes("Smoke test resource"), "课程资料下载失败");

  const csv = await fetch(`${base}/api/teacher/quizzes/${quizId}/export`, { headers: { cookie } });
  assert(csv.ok && (await csv.text()).includes("20260001"), "CSV 导出失败");
  console.log("✓ 学生登录、测验、排行榜、成绩册、课程资料上传下载、统计与 CSV 导出均通过");
} finally {
  if (resourceId && cookie) {
    await fetch(`${base}/api/teacher/resources/${resourceId}`, { method: "DELETE", headers: { cookie } });
  }
  if (quizId && cookie) {
    await fetch(`${base}/api/teacher/quizzes/${quizId}`, { method: "DELETE", headers: { cookie } });
  }
}
