import { barGeometry } from "./bar-chart";
import Konva from "konva";
import { tableGeometry } from "./v06-geometry";
import { gradientProps } from "./editor-utils";
import { loadImage } from "./imports";
import type { PageData } from "./types";
import type { Project } from "./project";
import { exportCheckpoint, exportSize, type ExportOptions } from "./export-options";
export async function renderPage(
  page: PageData,
  width: number,
  height: number,
  options: ExportOptions = {},
) {
  options.signal?.throwIfAborted();
  await document.fonts.ready;
  await document.fonts.load('400 32px "Noto Sans KR"', "한글");
  await document.fonts.load('700 32px "Noto Sans KR"', "한글");
  // Load the actual glyph subsets/styles used on this page before drawing.
  for (const el of page.elements) {
    if (!el.visible || !(el.type === "text" || el.type === "table" || el.type === "chart")) continue;
    const glyphs = el.type === "text" ? el.text : el.type === "table" ? el.cells.map(c=>c.text).join("") : el.data.map(d=>d.label).join("");
    await document.fonts.load(`${el.type === "text" && el.italic ? "italic " : ""}${el.type === "text" && el.bold ? 700 : 400} 32px "${el.fontFamily.replace(/["\\]/g, "")}"`, glyphs);
    if (el.type === "table") await document.fonts.load(`700 32px "${el.fontFamily.replace(/["\\]/g, "")}"`, glyphs);
  }
  options.signal?.throwIfAborted();
  const size = exportSize(width, height, options.scale ?? 1);
  const container = document.createElement("div");
  const stage = new Konva.Stage({ container, width: size.width, height: size.height });
  const layer = new Konva.Layer({ scaleX: size.width / width, scaleY: size.height / height, listening: false });
  layer.getCanvas().setPixelRatio(1);
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
      options.signal?.throwIfAborted();
      if (!el.visible) continue;
      const common = {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        opacity: el.opacity,
        ...(el.shadow?.enabled ? { shadowColor: el.shadow.color, shadowBlur: el.shadow.blur,
          shadowOffsetX: el.shadow.offsetX, shadowOffsetY: el.shadow.offsetY } : {}),
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
            perfectDrawEnabled: false,
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
          new (el.arrowStart || el.arrowEnd ? Konva.Arrow : Konva.Line)({
            ...common,
            points: [0, 0, Math.max(el.width, 12), 0],
            fill: el.stroke,
            pointerLength: Math.max(10, el.strokeWidth * 2.4),
            pointerWidth: Math.max(8, el.strokeWidth * 2),
            pointerAtBeginning: el.arrowStart,
            pointerAtEnd: el.arrowEnd,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            dash: el.dashed
              ? [el.strokeWidth * 2.2, el.strokeWidth * 1.8]
              : undefined,
            lineCap: "round",
          }),
        );
      else if (el.type === "chart") {
        const group=new Konva.Group(common);
        for(const b of barGeometry(el)){
          group.add(new Konva.Rect({x:b.x,y:b.y,width:b.width,height:b.height,fill:el.fill}));
          group.add(new Konva.Text({x:b.labelX,y:Math.max(0,b.y-el.fontSize-4),width:b.labelW,text:b.value,align:"center",fontFamily:el.fontFamily,fontSize:el.fontSize,fill:el.textColor}));
          group.add(new Konva.Text({x:b.labelX,y:b.labelY,width:b.labelW,height:b.labelH,text:b.label,align:"center",fontFamily:el.fontFamily,fontSize:el.fontSize,fill:el.textColor,ellipsis:true}));
        }
        layer.add(group);
      }
      else if (el.type === "table") {
        const group=new Konva.Group(common),{colX,colW,rowH}=tableGeometry(el);
        for(let r=0;r<el.rows;r++)for(let c=0;c<el.cols;c++){
          const cell=el.cells[r*el.cols+c],color=cell.fill??(r===0?el.headerFill:el.fill);
          group.add(new Konva.Rect({x:colX[c],y:r*rowH,width:colW[c],height:rowH,fill:color,stroke:el.borderColor,strokeWidth:el.borderWidth}));
          group.add(new Konva.Text({x:colX[c]+10,y:r*rowH,width:Math.max(8,colW[c]-20),height:rowH,text:cell.text,fontSize:el.fontSize,fontFamily:el.fontFamily,fontStyle:cell.bold||r===0?"bold":"normal",fill:r===0?(el.headerTextColor??"#FFFFFF"):el.textColor,verticalAlign:"middle",wrap:"word",ellipsis:true}));
        }
        layer.add(group);
      }
      else if (el.type === "image")
        layer.add(
          new Konva.Image({ ...common, cornerRadius: el.radius, image: await loadImage(el.src) }),
        );
      else throw new Error(`지원하지 않는 출력 객체: ${el.type}`);
    }
    layer.draw();
    options.signal?.throwIfAborted();
    return stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
  } finally {
    stage.destroy();
  }
}
export async function exportPDF(p: Project, options: ExportOptions = {}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: p.width >= p.height ? "landscape" : "portrait",
    unit: "px",
    format: [p.width, p.height],
    hotfixes: ["px_scaling"],
  });
  for (let i = 0; i < p.pages.length; i++) {
    await exportCheckpoint(options, i, p.pages.length);
    if (i)
      pdf.addPage(
        [p.width, p.height],
        p.width >= p.height ? "landscape" : "portrait",
      );
    pdf.addImage(
      await renderPage(p.pages[i], p.width, p.height, { ...options, scale: exportSize(p.width, p.height, options.scale ?? 1, p.pages.length).scale }),
      "PNG",
      0,
      0,
      p.width,
      p.height,
    );
  }
  await exportCheckpoint(options, p.pages.length, p.pages.length);
  return pdf.output("blob");
}
