import { aiConfig } from "@/lib/ai-analyzer";
import { guard } from "@/lib/server-guard";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return (
    guard(req) ??
    Response.json({
      ...aiConfig(),
      dailyLimit: Math.max(
        1,
        Math.min(100, Number(process.env.AI_DAILY_LIMIT) || 20),
      ),
    })
  );
}
