import { spawn } from "node:child_process";
import { resolve } from "node:path";

const port = process.env.PREVIEW_PORT || "3100";
const nextCli = resolve("node_modules", "next", "dist", "bin", "next");

console.log("答答看本地预览模式");
console.log(`学生端：http://localhost:${port}`);
console.log(`教师端：http://localhost:${port}/teacher`);
console.log("教师密码：dev-only-do-not-deploy（仅限本地预览，正式部署必须改 .env）");
console.log("预览数据只保存在内存中，停止服务后会自动清空。\n");

const child = spawn(process.execPath, [nextCli, "dev", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    PREVIEW_MODE: "true",
    TEACHER_PASSWORD: process.env.TEACHER_PASSWORD || "dev-only-do-not-deploy",
    SESSION_SECRET:
      process.env.SESSION_SECRET || "local-preview-session-secret-not-for-production",
  },
});

child.on("error", (error) => {
  console.error("无法启动本地预览：", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`本地预览已由信号 ${signal} 停止。`);
  }
  process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
