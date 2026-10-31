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
  assert(results.data.statistics.averageAccuracy === 0.75 && results.data.statistics.questions.length === 3, "Versioned averages are incorrect");
  assert(results.data.statistics.questions.find((question) => question.prompt === "Original question")?.responseCount === 2 &&
    results.data.statistics.questions.find((question) => question.prompt === "Additional question")?.accuracy === 0, "Historical questions are missing from results");
  const privateHistory = await json(`/api/teacher/quizzes/${quizId}/question-history`);
  assert(privateHistory.response.status === 401, "Question history is available without teacher login");
  const history = await json(`/api/teacher/quizzes/${quizId}/question-history`, { headers: { cookie: teacherCookie } });
  const [original, revised] = history.data.revisions || [];
  assert(history.response.ok && original?.responseCount === 2 && revised?.responseCount === 1, "Historical response counts are incorrect");
  assert(original.questions[0].prompt === "Original question" && original.questions[0].correctCount === 2 && original.questions[0].accuracy === 1 && original.questions[0].imageKey === imageKey, "Original question history is incorrect");
  assert(revised.questions.length === 2 && revised.questions[0].correctCount === 1 && revised.questions[1].correctCount === 0 && revised.questions[1].accuracy === 0, "Revised question history is incorrect");
  const repeated = await json(`/api/teacher/quizzes/${quizId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", cookie: teacherCookie },
    body: JSON.stringify({ title: "Same questions, new version", questions: [
      { prompt: "Revised question", options: ["A", "B"], correctIndex: 1 },
      { prompt: "Additional question", options: ["C", "D"], correctIndex: 1 },
    ] }),
  });
  assert(repeated.response.ok, "Repeat-version edit failed");
  const fourthCookie = await guest(4);
  const fourthStarted = await json(`/api/quizzes/${code}`, { headers: { cookie: fourthCookie } });
  assert(fourthStarted.response.ok, "Fourth student did not receive repeat version");
  const fourthFinished = await json(`/api/quizzes/${code}/submit`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: fourthCookie }, body: JSON.stringify({ answers: [0, 1] }),
  });
  assert(fourthFinished.response.ok && fourthFinished.data.score === 1, "Repeat-version grading failed");
  const combined = await json(`/api/teacher/quizzes/${quizId}/results`, { headers: { cookie: teacherCookie } });
  const combinedQuestions = combined.data.statistics.questions;
  assert(combined.response.ok && combined.data.statistics.submissionCount === 4 && combined.data.statistics.currentRevisionSubmissionCount === 1, "Combined submission counts are incorrect");
  assert(combinedQuestions.length === 3 && combinedQuestions.filter((question) => question.isCurrent).length === 2, "Changed questions were incorrectly merged");
  assert(combinedQuestions.find((question) => question.prompt === "Revised question")?.responseCount === 2 &&
    combinedQuestions.find((question) => question.prompt === "Additional question")?.correctCount === 1 &&
    combinedQuestions.find((question) => question.prompt === "Original question")?.responseCount === 2, "Identical questions were not combined across versions");
  console.log("✓ Live edit, old/new versions, image access, grading and combined per-question statistics passed");
} finally {
  if (quizId) await fetch(`${base}/api/teacher/quizzes/${quizId}`, { method: "DELETE", headers: { cookie: teacherCookie } });
  else if (imageKey) await fetch(`${base}/api/teacher/question-images`, { method: "DELETE", headers: { "Content-Type": "application/json", cookie: teacherCookie }, body: JSON.stringify({ imageKey }) });
}
