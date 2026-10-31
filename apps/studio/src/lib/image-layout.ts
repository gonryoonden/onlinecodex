/** Contain a source in a page, preserving its aspect ratio and pixel coordinate mapping. */
export function fitSource(
  sourceWidth: number,
  sourceHeight: number,
  pageWidth: number,
  pageHeight: number,
) {
  const scale = Math.min(pageWidth / sourceWidth, pageHeight / sourceHeight);
  const width = sourceWidth * scale,
    height = sourceHeight * scale;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
    scale,
  };
}
