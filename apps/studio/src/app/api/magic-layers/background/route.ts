import { z } from "zod";
import { guard, boundedJson } from "@/lib/server-guard";
import { imageData } from "@/lib/project";
import { analysisSchema } from "@/lib/magic-layers/schema";
import { localRepair } from "@/lib/local-repair-server";
export const runtime = "nodejs";
export const maxDuration = 60;
let busy = false;
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (busy)
    return Response.json(
      { error: "로컬 보정이 진행 중입니다." },
      { status: 429 },
    );
  busy = true;
  try {
    const payload = z
      .object({
        image: imageData,
        analysis: analysisSchema,
        skip: z.array(z.string()).max(80),
        method: z.enum(["telea", "ns"]),
        textMode: z.enum(["ink", "boxes"]),
        padding: z.number().int().min(0).max(12),
      })
      .parse(await boundedJson(req, 26 * 1024 * 1024));
    return Response.json(await localRepair(payload));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "이미지와 유효한 영역/보정 설정이 필요합니다."
            : error instanceof Error
              ? error.message
              : "로컬 보정 실패",
      },
      { status: 422 },
    );
  } finally {
    busy = false;
  }
}
