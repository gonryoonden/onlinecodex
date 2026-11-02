import Konva from "konva";
import { gradientProps } from "./editor-utils";
import { loadImage } from "./imports";
import type { PageData } from "./types";
import type { Project } from "./project";
export async function renderPage(
  page: PageData,
  width: number,
  height: number,
) {
  await document.fonts.ready;
  await document.fonts.load('400 32px "Noto Sans KR"', "한글");
  await document.fonts.load('700 32px "Noto Sans KR"', "한글");
  const container = document.createElement("div");
  const stage = new Konva.Stage({ container, width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(
    new Konva.Rect({
      width,
      height,
      ...(page.background.type === "solid"
        ? { fill: page.background.color }
        : gradientProps(
            page.background.from,
            page.background.to,
            page.background.angle,
            width,
            height,
          )),
    }),
  );
  try {
    for (const el of page.elements) {
      if (!el.visible) continue;
      const common = {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        opacity: el.opacity,
      };
      if (el.type === "text")
        layer.add(
          new Konva.Text({
            ...common,
            text: el.uppercase ? el.text.toUpperCase() : el.text,
            fontFamily: el.fontFamily,
            fontSize: el.fontSize,
            fontStyle: `${el.italic ? "italic " : ""}${el.bold ? "bold" : "normal"}`,
            textDecoration: [
              el.underline ? "underline" : "",
              el.strike ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" "),
            fill: el.fill,
            align: el.align,
            lineHeight: el.lineHeight,
            letterSpacing: el.letterSpacing,
            height: undefined,
          }),
        );
      else if (el.type === "rect")
        layer.add(
          new Konva.Rect({
            ...common,
            fill: el.fill,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            cornerRadius: el.cornerRadius,
          }),
        );
      else if (el.type === "ellipse")
        layer.add(
          new Konva.Ellipse({
            ...common,
            x: el.x + el.width / 2,
            y: el.y + el.height / 2,
            radiusX: el.width / 2,
            radiusY: el.height / 2,
            fill: el.fill,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
          }),
        );
      else if (el.type === "line")
        layer.add(
          new Konva.Line({
            ...common,
            points: [0, 0, el.width, 0],
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            dash: el.dashed
              ? [el.strokeWidth * 2.2, el.strokeWidth * 1.8]
              : undefined,
            lineCap: "round",
          }),
        );
      else if (el.type === "image")
        layer.add(
          new Konva.Image({ ...common, image: await loadImage(el.src) }),
        );
      else throw new Error(`지원하지 않는 출력 객체: ${el.type}`);
    }
    layer.draw();
    return stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
  } finally {
    stage.destroy();
  }
}
export async function exportPDF(p: Project) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: p.width >= p.height ? "landscape" : "portrait",
    unit: "px",
    format: [p.width, p.height],
    hotfixes: ["px_scaling"],
  });
  for (let i = 0; i < p.pages.length; i++) {
    if (i)
      pdf.addPage(
        [p.width, p.height],
        p.width >= p.height ? "landscape" : "portrait",
      );
    pdf.addImage(
      await renderPage(p.pages[i], p.width, p.height),
      "PNG",
      0,
      0,
      p.width,
      p.height,
    );
  }
  return pdf.output("blob");
}
