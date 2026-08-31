import LeaderboardClient from "@/components/LeaderboardClient";

export default async function LeaderboardPage({ params }: PageProps<"/quiz/[code]/leaderboard">) {
  const { code } = await params;
  return <LeaderboardClient code={code.toUpperCase()} />;
}
