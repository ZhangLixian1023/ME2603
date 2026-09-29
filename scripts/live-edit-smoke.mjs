const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3131";
const password = process.env.TEACHER_PASSWORD;
if (!password) throw new Error("TEACHER_PASSWORD is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const data = await response.json();
  return { response, data };
}

async function guest(index) {
  const id = `editprobe${Date.now().toString(36)}${index}`;
  const { response } = await json("/api/student/guest-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: id, name: `Edit Probe ${index}` }),
  });
  assert(response.ok, "Guest login failed");
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

const teacher = await json("/api/teacher/login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
});
assert(teacher.response.ok, "Teacher login failed");
const teacherCookie = teacher.response.headers.get("set-cookie")?.split(";")[0] || "";
let quizId;
let imageKey;

try {
  const image = new FormData();
  image.set("image", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], "probe.png", { type: "image/png" }));
  const uploaded = await json("/api/teacher/question-images", { method: "POST", headers: { cookie: teacherCookie }, body: image });
  assert(uploaded.response.ok, "Question image upload failed");
  imageKey = uploaded.data.imageKey;

  const code = `EDIT${Date.now().toString(36)}`.toUpperCase();
  const created = await json("/api/teacher/quizzes", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: teacherCookie },
    body: JSON.stringify({ code, title: "Before edit", published: true, questions: [{ prompt: "Original question", options: ["A", "B"], correctIndex: 0, imageKey }] }),
  });
  assert(created.response.ok, `Create failed: ${JSON.stringify(created.data)}`);
  quizId = created.data.quiz.id;
  const [oldCookie, activeCookie, newCookie] = await Promise.all([guest(1), guest(2), guest(3)]);

  const oldStarted = await json(`/api/quizzes/${code}`, { headers: { cookie: oldCookie } });
  const activeStarted = await json(`/api/quizzes/${code}`, { headers: { cookie: activeCookie } });
  assert(oldStarted.response.ok && activeStarted.response.ok, "Old version was not started");
  const originalImageUrl = activeStarted.data.quiz.questions[0].imageUrl;
  const oldSubmitted = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: oldCookie }, body: JSON.stringify({ answers: [0] }),
  });
  assert(oldSubmitted.response.ok && oldSubmitted.data.score === 1, "Original grading failed");

  const edited = await json(`/api/teacher/quizzes/${quizId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", cookie: teacherCookie },
    body: JSON.stringify({ title: "After edit", questions: [
      { prompt: "Revised question", options: ["A", "B"], correctIndex: 1 },
      { prompt: "Additional question", options: ["C", "D"], correctIndex: 1 },
    ] }),
  });
  assert(edited.response.ok, `Edit while active failed: ${JSON.stringify(edited.data)}`);

  const oldResumed = await json(`/api/quizzes/${code}`, { headers: { cookie: activeCookie } });
  const newStarted = await json(`/api/quizzes/${code}`, { headers: { cookie: newCookie } });
  assert(oldResumed.response.ok && oldResumed.data.quiz.questions.length === 1 && oldResumed.data.quiz.questions[0].prompt === "Original question", "Active student lost original version");
  assert(newStarted.response.ok && newStarted.data.quiz.questions.length === 2 && newStarted.data.quiz.questions[0].prompt === "Revised question", "New student did not receive revision");
  assert(!JSON.stringify(oldResumed.data).includes(imageKey) && !JSON.stringify(newStarted.data).includes("correctIndex"), "Student API leaked answer or object key");
  const imageResponse = await fetch(`${base}${originalImageUrl}`, { headers: { cookie: activeCookie } });
  assert(imageResponse.ok && (await imageResponse.arrayBuffer()).byteLength > 0, "Original image became unavailable");
  const unauthorizedImage = await fetch(`${base}${originalImageUrl}`, { headers: { cookie: newCookie } });
  assert(unauthorizedImage.status === 404, "New student can access old-version image");

  const savedOldAnswer = await json(`/api/quizzes/${code}/attempt`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: activeCookie },
    body: JSON.stringify({ questionIndex: 0, answer: 0 }),
  });
  assert(savedOldAnswer.response.ok && savedOldAnswer.data.attempt.answers.length === 1, "Old-version autosave failed after edit");

  const oldFinished = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: activeCookie }, body: JSON.stringify({ answers: [0] }),
  });
  const newFinished = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: newCookie }, body: JSON.stringify({ answers: [1, 0] }),
  });
  assert(oldFinished.response.ok && oldFinished.data.score === 1 && oldFinished.data.total === 1, "Old grading changed after edit");
  assert(newFinished.response.ok && newFinished.data.score === 1 && newFinished.data.total === 2, "New grading failed");
  const results = await json(`/api/teacher/quizzes/${quizId}/results`, { headers: { cookie: teacherCookie } });
  assert(results.response.ok && results.data.statistics.submissionCount === 3 && results.data.statistics.currentRevisionSubmissionCount === 1, "Versioned counts are incorrect");
  assert(results.data.statistics.averageAccuracy === 0.75 && results.data.statistics.questions.every((question) => question.responseCount === 1) && results.data.statistics.questions[1].accuracy === 0, "Versioned averages are incorrect");
  console.log("✓ Live edit, old/new versions, image access, grading and statistics passed");
} finally {
  if (quizId) await fetch(`${base}/api/teacher/quizzes/${quizId}`, { method: "DELETE", headers: { cookie: teacherCookie } });
  else if (imageKey) await fetch(`${base}/api/teacher/question-images`, { method: "DELETE", headers: { "Content-Type": "application/json", cookie: teacherCookie }, body: JSON.stringify({ imageKey }) });
}
