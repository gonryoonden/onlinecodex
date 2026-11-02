import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
export async function localRepair(payload: unknown): Promise<unknown> {
  const script = path.resolve(process.cwd(), "../../scripts/studio-inpaint.py");
  return new Promise((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */ process.env.STUDIO_PYTHON || "python3",
      [script],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH ?? "",
          LANG: "C.UTF-8",
          PYTHONDONTWRITEBYTECODE: "1",
        },
      },
    );
    let total = 0,
      stderr = "";
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("로컬 보정 시간이 초과되었습니다. 영역을 줄이세요."));
    }, 45000);
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 40 * 1024 * 1024) {
        child.kill();
        reject(new Error("로컬 보정 출력이 너무 큽니다."));
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString().slice(0, 1000);
    });
    child.on("error", () => {
      clearTimeout(timeout);
      reject(
        new Error(
          "로컬 Python 실행 실패. STUDIO_PYTHON과 setup-studio를 확인하세요.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("로컬 보정 응답 형식 오류"));
        }
      } else {
        let detail = "영역/마스크 또는 로컬 OpenCV 설치를 확인하세요.";
        try {
          detail = JSON.parse(stderr).error ?? detail;
        } catch {}
        reject(new Error("로컬 보정 실패: " + detail));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
