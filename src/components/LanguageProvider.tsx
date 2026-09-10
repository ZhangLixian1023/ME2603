"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "zh";

const messages = {
  en: {
    brand: "QuizPop",
    teacherEntry: "Teacher portal",
    heroEyebrow: "A lightweight quiz built for class",
    heroTitleStart: "Every answer",
    heroTitleEmphasis: "deserves to be seen.",
    heroDescription: "Enter the class code and start immediately. No account needed, with instant feedback after submission.",
    classCode: "Class code",
    codePlaceholder: "e.g. DEMO26",
    joinQuiz: "Join quiz",
    demoCode: "Demo code: DEMO26",
    weeklyQuiz: "Weekly quiz",
    niceWork: "Nice work — keep it up!",
    autoGrading: "Auto grading",
    instantResults: "Results on submission",
    classLeaderboard: "Class leaderboard",
    nicknameOnly: "Names only",
    noStudentAccount: "No student account",
    idNicknameToJoin: "Join with a student ID and name",
    gradedAfterSubmit: "Graded after submission",
    noAnswersRevealed: "Shows right or wrong without revealing answers",
    liveLeaderboard: "Live class leaderboard",
    rankedByScore: "Ranked by number of correct answers",
    privacy: "Privacy",
    backToQuiz: "Back to quiz",
    liveUpdates: "Live updates",
    refreshRanking: "Refresh ranking",
    refreshing: "Refreshing…",
    rank: "Rank",
    student: "Student",
    correctAnswers: "Correct",
    emptyLeaderboard: "The leaderboard is empty",
    emptyLeaderboardDetail: "Rankings will appear after the first submission.",
    leaderboardPrivacy: "Names are shown publicly · Student IDs stay private · Updates every 10 seconds",
    loadingQuiz: "Opening quiz…",
    justAMoment: "Just a moment",
    unavailable: "Unable to enter",
    quizNotFound: "Quiz not found",
    backHome: "Back to home",
    submitted: "Submitted",
    perfect: "Perfect score — excellent!",
    goodJob: "Good job!",
    keepTrying: "Keep going!",
    resultPrivacy: "Only right or wrong is shown below. Correct answers remain hidden.",
    question: "Question",
    correct: "Correct",
    incorrect: "Incorrect",
    viewLeaderboard: "View leaderboard",
    code: "Code",
    readyToStart: "Ready to start",
    multipleChoiceQuestions: "multiple-choice questions",
    oneSubmission: "1 submission only",
    studentId: "Student ID",
    teacherOnly: "Visible to teacher only",
    studentIdPlaceholder: "Enter your student ID",
    leaderboardNickname: "Student name",
    publicDisplay: "Shown publicly",
    nicknamePlaceholder: "Enter your name",
    startQuiz: "Start quiz",
    answering: "Quiz in progress",
    completed: "completed",
    answerEveryQuestion: "Please answer every question before submitting",
    submitting: "Submitting…",
    submitAll: "Submit all answers",
    invalidStudentId: "Enter a valid student ID (2–30 letters, numbers, - or _).",
    invalidNickname: "Enter a name between 1 and 20 characters.",
    unanswered: "Some questions are unanswered. Please check before submitting.",
    confirmSubmit: "Answers cannot be changed after submission. Submit now?",
    loadQuizFailed: "Unable to load the quiz",
    submitFailed: "Submission failed",
    loadLeaderboardFailed: "Unable to load the leaderboard",
    openingTeacher: "Opening teacher dashboard…",
    teacherSpaceMessage: "Create, publish and review — all in one place.",
    teacherAccess: "Teacher access",
    welcomeBack: "Welcome back",
    teacherLoginDetail: "Enter the teacher password to open the dashboard.",
    teacherPassword: "Teacher password",
    passwordPlaceholder: "Enter password",
    signingIn: "Signing in…",
    enterDashboard: "Open dashboard →",
    passwordManaged: "Password is set by the site administrator",
    myQuizzes: "My quizzes",
    newQuiz: "New quiz",
    logout: "Log out",
    teacherDashboard: "Teacher dashboard",
    dashboardDetail: "Create a class quiz, publish it, then share the code with students.",
    totalQuizzes: "Total quizzes",
    published: "Published",
    submissionsReceived: "Submissions",
    quizzesUnit: "quiz(es)",
    submissionsUnit: "submission(s)",
    allQuizzes: "All quizzes",
    questionsShort: "questions",
    submittedShort: "submitted",
    draft: "Draft",
    copyLink: "Copy link",
    leaderboard: "Leaderboard",
    edit: "Edit",
    results: "Results",
    exportCsv: "Export CSV",
    takeOffline: "Take offline",
    publish: "Publish",
    delete: "Delete",
    teacherVisible: "Teacher only",
    studentResults: "Student results",
    loading: "Loading…",
    noSubmissions: "No submissions yet",
    noSubmissionsDetail: "Results will appear after you publish and share the class code.",
    nickname: "Student name",
    action: "Action",
    allowRetry: "Allow retry",
    editQuiz: "Edit quiz",
    createQuiz: "Create a new quiz",
    quizTitle: "Quiz title",
    quizTitlePlaceholder: "e.g. Week 3 class quiz",
    shortDescription: "Short description (optional)",
    descriptionPlaceholder: "Tell students what this quiz covers",
    remove: "Remove",
    questionPrompt: "Enter the question",
    option: "Option",
    correctAnswerTip: "Select the circle beside the correct answer",
    addQuestion: "Add question",
    saving: "Saving…",
    saveDraft: "Save draft",
    saveChanges: "Save changes",
    savePublish: "Save and publish",
    signInFailed: "Sign-in failed",
    readQuizFailed: "Unable to read the quiz",
    saveFailed: "Unable to save",
    readResultsFailed: "Unable to load results",
    operationFailed: "Operation failed",
    deleteFailed: "Unable to delete",
    quizUpdated: "Quiz updated.",
    quizDeleted: "Quiz deleted.",
    linkCopied: "Student link copied.",
    deleteQuizConfirm: "Delete “{title}”? Its submissions will also be deleted.",
    retryConfirm: "Deleting this submission lets the student ID submit again. Continue?",
    quizCreated: "Quiz created. Class code: {code}. {status}",
    studentsCanEnter: "Students can enter now.",
    publishToOpen: "Publish it when you are ready for students.",
    privacyTitle: "Privacy notice",
    privacyIntro: "QuizPop collects only what is needed for classroom quizzes: student ID, student name, answers, score and submission time.",
    whoSeesWhat: "Who can see what?",
    whoSeesWhatBody: "The public leaderboard shows student names and scores. Student IDs, detailed answers and submission records are visible only to the teacher. Correct answers are never exposed through student APIs.",
    howUsed: "How is information used?",
    howUsedBody: "Data is used only to prevent duplicate submissions, grade answers, produce class statistics and let teachers handle retry requests. The site has no advertising and does not sell student data.",
    retention: "How long is it kept?",
    retentionBody: "Submissions are kept for 365 days by default. Administrators can change this period, and teachers can delete quizzes or individual submissions.",
    nicknameReminder: "Name visibility",
    nicknameReminderBody: "Student names are shown publicly on the leaderboard. Student IDs are visible only to the teacher.",
  },
  zh: {
    brand: "答答看", teacherEntry: "教师入口", heroEyebrow: "为课堂而生的轻量测验", heroTitleStart: "每一次回答，", heroTitleEmphasis: "都值得被看见。", heroDescription: "输入课堂代码，即刻开始答题。无需注册，提交后马上知道自己的掌握情况。", classCode: "课堂代码", codePlaceholder: "例如 DEMO26", joinQuiz: "进入测验", demoCode: "试用代码：DEMO26", weeklyQuiz: "本周小测", niceWork: "做得不错，再接再厉！", autoGrading: "自动批改", instantResults: "提交即出结果", classLeaderboard: "班级榜单", nicknameOnly: "只展示姓名", noStudentAccount: "无需学生账号", idNicknameToJoin: "输入学号与姓名即可参与", gradedAfterSubmit: "提交后自动判分", noAnswersRevealed: "只提示对错，不泄露答案", liveLeaderboard: "实时班级榜单", rankedByScore: "按正确题数轻松排名", privacy: "隐私说明", backToQuiz: "返回测验", liveUpdates: "实时更新", refreshRanking: "刷新排名", refreshing: "刷新中…", rank: "排名", student: "学生姓名", correctAnswers: "正确题数", emptyLeaderboard: "榜单还是空的", emptyLeaderboardDetail: "第一份答卷提交后，排名会出现在这里。", leaderboardPrivacy: "排行榜公开显示姓名，学号仅教师可见 · 每 10 秒自动更新", loadingQuiz: "正在打开测验…", justAMoment: "马上就好", unavailable: "暂时无法进入", quizNotFound: "测验不存在", backHome: "返回首页", submitted: "提交成功", perfect: "全部答对，太棒了！", goodJob: "做得不错！", keepTrying: "继续加油！", resultPrivacy: "以下仅显示每题对错，正确答案不会公开。", question: "第", correct: "回答正确", incorrect: "回答错误", viewLeaderboard: "查看排行榜", code: "代码", readyToStart: "准备开始", multipleChoiceQuestions: "道选择题", oneSubmission: "仅可提交 1 次", studentId: "学号", teacherOnly: "仅老师可见", studentIdPlaceholder: "请输入你的学号", leaderboardNickname: "姓名", publicDisplay: "排行榜公开显示", nicknamePlaceholder: "请输入你的姓名", startQuiz: "开始答题", answering: "正在答题", completed: "已完成", answerEveryQuestion: "请确认每道题都已作答", submitting: "提交中…", submitAll: "提交全部答案", invalidStudentId: "请输入有效学号（2–30 位字母、数字、- 或 _）", invalidNickname: "请输入 1–20 个字符的姓名", unanswered: "还有题目没有回答，请检查后再提交。", confirmSubmit: "提交后不能修改答案，确定提交吗？", loadQuizFailed: "无法载入测验", submitFailed: "提交失败", loadLeaderboardFailed: "无法载入排行榜", openingTeacher: "正在打开教师后台…", teacherSpaceMessage: "创建、发布、查看，一站完成。", teacherAccess: "教师专属入口", welcomeBack: "欢迎回来", teacherLoginDetail: "请输入教师密码进入管理后台。", teacherPassword: "教师密码", passwordPlaceholder: "请输入密码", signingIn: "登录中…", enterDashboard: "进入后台 →", passwordManaged: "密码由网站管理员设置", myQuizzes: "我的测验", newQuiz: "新建测验", logout: "退出登录", teacherDashboard: "教师工作台", dashboardDetail: "创建课堂小测，发布后分享代码给学生。", totalQuizzes: "测验总数", published: "已发布", submissionsReceived: "收到答卷", quizzesUnit: "份", submissionsUnit: "份", allQuizzes: "全部测验", questionsShort: "题", submittedShort: "人提交", draft: "草稿", copyLink: "复制链接", leaderboard: "排行榜", edit: "编辑", results: "成绩", exportCsv: "导出 CSV", takeOffline: "下线", publish: "发布", delete: "删除", teacherVisible: "教师可见", studentResults: "学生成绩", loading: "读取中…", noSubmissions: "还没有学生提交", noSubmissionsDetail: "发布并分享课堂代码后，成绩会出现在这里。", nickname: "学生姓名", action: "操作", allowRetry: "允许重答", editQuiz: "编辑测验", createQuiz: "创建新测验", quizTitle: "测验标题", quizTitlePlaceholder: "例如：第 3 周课堂小测", shortDescription: "简短说明（可选）", descriptionPlaceholder: "告诉学生这次会考什么", remove: "删除", questionPrompt: "输入题目内容", option: "选项", correctAnswerTip: "选中圆点标记正确答案", addQuestion: "添加题目", saving: "保存中…", saveDraft: "保存草稿", saveChanges: "保存修改", savePublish: "保存并发布", signInFailed: "登录失败", readQuizFailed: "读取测验失败", saveFailed: "保存失败", readResultsFailed: "读取成绩失败", operationFailed: "操作失败", deleteFailed: "删除失败", quizUpdated: "测验内容已更新。", quizDeleted: "测验已删除。", linkCopied: "学生答题链接已复制。", deleteQuizConfirm: "确定删除“{title}”吗？它的答卷也会一并删除。", retryConfirm: "删除后，这个学号可以重新提交。确定吗？", quizCreated: "测验已创建，课堂代码是 {code}。{status}", studentsCanEnter: "现在学生可以进入。", publishToOpen: "发布后学生即可进入。", privacyTitle: "隐私说明", privacyIntro: "答答看只收集完成课堂测验所需的信息：学号、学生姓名、作答内容、得分与提交时间。", whoSeesWhat: "谁能看到什么？", whoSeesWhatBody: "公开排行榜显示学生姓名与正确题数。学号、具体作答和提交记录仅教师端可见，标准答案不会通过学生接口公开。", howUsed: "信息如何使用？", howUsedBody: "数据仅用于限制重复提交、自动评分、生成班级统计，以及由教师处理重答申请。本站不包含广告，也不出售学生数据。", retention: "保存多久？", retentionBody: "答卷默认保存 365 天，管理员可通过环境变量调整期限。教师也可在后台删除测验或单条答卷。", nicknameReminder: "姓名显示说明", nicknameReminderBody: "学生姓名会公开显示在排行榜中，学号仅教师可见。",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("quiz-language");
      if (stored === "en" || stored === "zh") setLanguageState(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage(nextLanguage) {
      setLanguageState(nextLanguage);
      window.localStorage.setItem("quiz-language", nextLanguage);
    },
    t(key) {
      return messages[language][key];
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

const apiErrors: Record<string, MessageKey> = {
  "请先登录": "signInFailed",
  "密码不正确": "signInFailed",
  "测验不存在或尚未发布": "quizNotFound",
  "提交过于频繁，请稍后再试": "submitFailed",
  "请完成全部题目": "unanswered",
  "提交失败，请稍后重试": "submitFailed",
  "这个学号已经提交过本次测验": "submitFailed",
  "测验不存在": "quizNotFound",
};

export function localizeApiError(message: unknown, language: Language, fallback: MessageKey) {
  if (language === "zh" && typeof message === "string") return message;
  if (typeof message === "string" && apiErrors[message]) return messages.en[apiErrors[message]];
  return messages[language][fallback];
}
