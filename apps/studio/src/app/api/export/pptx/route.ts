import { spawn } from "node:child_process";
import path from "node:path";
import { projectSchema } from "@/lib/project";
import { guard, boundedJson } from "@/lib/server-guard";
export const runtime = "nodejs";
export const maxDuration = 60;
let busy = false;
export async function POST(req: Request) {
  const reject = guard(req);
  if (reject) return reject;
  if (busy)
    return Response.json(
      { error: "PPTX를 생성 중입니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  busy = true;
  try {
    const p = projectSchema.parse(await boundedJson(req, 100 * 1024 * 1024));
    const script = path.resolve(process.cwd(), "../../scripts/studio-pptx.py");
    const result = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        /* turbopackIgnore: true */ process.env.STUDIO_PYTHON || "python3",
        [script],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        },
      );
      const chunks: Buffer[] = [];
      let total = 0;
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("PPTX 변환 시간 초과"));
      }, 45000);
      child.stdout.on("data", (c: Buffer) => {
        total += c.length;
        if (total > 100 * 1024 * 1024) {
          child.kill();
          reject(new Error("출력 용량 초과"));
        } else chunks.push(c);
      });
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString().slice(0, 2000);
      });
      child.on("error", () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "Python 실행 실패. STUDIO_PYTHON과 로컬 설치를 확인하세요.",
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(Buffer.concat(chunks));
        else
          reject(
            new Error(
              stderr.includes("ModuleNotFoundError")
                ? "Python 패키지 누락. scripts/setup-studio를 실행하세요."
                : "PPTX 변환 실패: 입력 이미지 또는 Python 환경을 확인하세요.",
            ),
          );
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(p));
    });
    return new Response(new Uint8Array(result), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": 'attachment; filename="studio.pptx"',
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "PPTX 내보내기 실패" },
      { status: 400 },
    );
  } finally {
    busy = false;
  }
}
