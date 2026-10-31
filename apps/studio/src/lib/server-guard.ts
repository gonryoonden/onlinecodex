import "server-only";
import { timingSafeEqual } from "node:crypto";
export function guard(req: Request) {
  const url = new URL(req.url);
  // Next can build req.url with localhost even when the browser used 127.0.0.1.
  // Host is browser-controlled authority; never trust X-Forwarded-Host here.
  const authority = req.headers.get("host") ?? url.host;
  let actual: URL;
  try {
    actual = new URL(`${url.protocol}//${authority}`);
  } catch {
    return Response.json({ error: "잘못된 Host" }, { status: 400 });
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const from = new URL(origin);
      if (
        from.host !== actual.host ||
        !["http:", "https:"].includes(from.protocol)
      )
        return Response.json(
          { error: "다른 사이트의 요청은 허용하지 않습니다." },
          { status: 403 },
        );
    } catch {
      return Response.json({ error: "잘못된 Origin" }, { status: 403 });
    }
  }
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "교차 사이트 요청 거부" }, { status: 403 });
  const token = process.env.STUDIO_ACCESS_TOKEN;
  if (token) {
    const value = Buffer.from(req.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (value.length !== expected.length || !timingSafeEqual(value, expected))
      return Response.json({ error: "개인용 접근 인증 필요" }, { status: 401 });
  } else if (!["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname))
    return Response.json(
      {
        error:
          "원격 접근은 인증된 개인용 프록시와 STUDIO_ACCESS_TOKEN 설정이 필요합니다.",
      },
      { status: 403 },
    );
  return null;
}
export async function boundedJson(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("요청 본문 누락");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("요청 용량 초과");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
