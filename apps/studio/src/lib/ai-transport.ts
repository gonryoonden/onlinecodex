// Keep the editable source unchanged; only compress the AI transport copy.
export async function prepareAiImage(dataUrl: string): Promise<string> {
  return (await prepareAiImageWithMetadata(dataUrl)).image;
}
export async function prepareAiImageWithMetadata(dataUrl: string) {
  const budget = 3_500_000; // base64 characters; leave room below hosting request limits
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("분석용 이미지를 읽지 못했습니다."));
    img.src = dataUrl;
  });
  const result = (encoded: string, width: number, height: number, quality?: number) => ({ image: encoded,
    transport: { width, height, mime: encoded.slice(5,encoded.indexOf(";")) as "image/png" | "image/jpeg" | "image/webp",
      characters: encoded.length, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight,
      compressed: encoded !== dataUrl, quality } });
  if (dataUrl.length <= budget) return result(dataUrl, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("분석용 이미지 변환을 지원하지 않는 브라우저입니다.");
  for (const maxEdge of [3000, 2400, 2000, 1600]) {
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.94, 0.85, 0.75]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= budget) return result(encoded, canvas.width, canvas.height, quality);
    }
  }
  throw new Error("분석용 이미지 용량을 줄이지 못했습니다. 이미지를 나누어 분석하세요.");
}
export async function readApiJson(response: Response) {
  if (response.status === 413)
    throw new Error("요청 용량이 서버 한도를 초과했습니다. 원본은 보존되었습니다.");
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(`서버 응답 오류 (${response.status}). 로그인 또는 서버 상태를 확인하세요.`);
  return response.json();
}
