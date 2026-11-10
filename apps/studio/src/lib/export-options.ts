export interface ExportOptions {
  scale?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

/** Bound canvas allocation before it happens; all pages share an aspect ratio. */
export function exportSize(width: number, height: number, scale = 2, pages = 1) {
  if (![width, height, scale, pages].every(Number.isFinite) ||
      width <= 0 || height <= 0 || scale <= 0 || pages < 1)
    throw new Error("잘못된 출력 크기입니다.");
  const ratio = Math.min(scale, 8192 / Math.max(width, height),
    Math.sqrt(Math.min(16_000_000, 64_000_000 / pages) / (width * height)));
  const fitted = Math.min(Math.max(1, Math.floor(width*ratio))/width,
    Math.max(1, Math.floor(height*ratio))/height);
  return { width: Math.max(1, Math.round(width * fitted)),
    height: Math.max(1, Math.round(height * fitted)), scale: fitted };
}

/** Office slide coordinates are limited to 1–56 inches. Keep the web canvas
 * unconstrained: scale the slide and letterbox unusually narrow page ratios. */
export function presentationFrame(width:number,height:number) {
  const scale=Math.min(5376/Math.max(width,height),Math.max(1,96/Math.min(width,height)));
  const frameWidth=Math.max(96,width*scale),frameHeight=Math.max(96,height*scale);
  return {width:frameWidth,height:frameHeight,image:{x:(frameWidth-width*scale)/2,
    y:(frameHeight-height*scale)/2,width:width*scale,height:height*scale}};
}

export async function exportCheckpoint(options: ExportOptions, done: number, total: number) {
  options.signal?.throwIfAborted();
  options.onProgress?.(done, total);
  // Let the browser paint progress and receive cancellation between pages.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  options.signal?.throwIfAborted();
}
