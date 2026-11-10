import Konva from "konva";
import type { TextElement } from "./types";

/** Fit rendered glyphs/wrapping, never alter or invent recognized characters. */
export async function fitTextToBox(t: TextElement) {
  if(t.width<=0 || t.height<=0) throw new Error("텍스트 상자 너비와 높이를 먼저 지정하세요.");
  const style=`${t.italic ? "italic " : ""}${t.bold ? "bold" : "normal"}`;
  await document.fonts.load(`${style} 32px "${t.fontFamily.replace(/["\\]/g, "")}"`,t.text);
  const node=new Konva.Text({text:t.uppercase?t.text.toUpperCase():t.text,width:t.width,
    fontFamily:t.fontFamily,fontStyle:style,lineHeight:t.lineHeight,letterSpacing:t.letterSpacing,wrap:"word"});
  try {
    const glyphs=[...new Set(Array.from(t.text.replace(/\s/g,"")))];
    const fits=(size:number)=>{node.fontSize(size);return node.height()<=t.height+.01 && glyphs.every(g=>node.measureSize(g).width<=t.width+.01);};
    if(fits(t.fontSize)) return t.fontSize;
    if(!fits(1)) throw new Error("상자가 너무 작습니다. 높이나 너비를 늘리세요.");
    let low=1,high=t.fontSize;
    for(let i=0;i<18;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}
    return Math.floor(low*10)/10;
  } finally {node.destroy();}
}
