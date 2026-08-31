import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "答答看 · 课堂 Quiz",
  description: "一个轻量、好用的课堂选择题测验工具",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
