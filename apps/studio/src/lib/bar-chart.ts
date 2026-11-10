import type { BarChartElement,TableElement } from './types';
export function verifiedTableSeries(table:TableElement){
 if(table.cols!==2||table.rows<2||table.rows>13)throw new Error('제목 행과 최대12개 항목이 있는 2열 표만 지원합니다.');
 const seriesName=table.cells[1].text.trim();if(!seriesName||seriesName.length>120)throw new Error('값 열의 제목을 확인하세요.');
 const data=Array.from({length:table.rows-1},(_,i)=>{
  const label=table.cells[(i+1)*2].text.trim(),raw=table.cells[(i+1)*2+1].text.trim();
  if(!label||label.length>120||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))throw new Error(`${i+2}행: 항목 이름과 0 이상 숫자를 확인하세요. 쉼표·%·단위·빈 값은 추정하지 않습니다.`);
  const value=Number(raw);if(!Number.isFinite(value)||value>1e9)throw new Error('차트 값은 0 이상 10억 이하입니다.');
  return {label,value};
 });
 return {seriesName,data};
}
/** Shared geometry for interactive Canvas and PNG/PDF. Office has its own text
 * layout engine; identical OOXML chart data is not a visual-fidelity guarantee. */
export function barGeometry(el:BarChartElement){
 const top=Math.min(32,el.height*.15),bottom=Math.max(top,el.height-Math.min(50,el.height*.25)),plotH=bottom-top;
 const slot=el.width/el.data.length,max=Math.max(1,...el.data.map(d=>d.value));
 return el.data.map((d,i)=>({label:d.label,value:String(d.value),x:i*slot+slot*.15,y:bottom-d.value/max*plotH,width:slot*.7,height:d.value/max*plotH,labelX:i*slot,labelY:bottom+4,labelW:slot,labelH:Math.max(1,el.height-bottom-4)}));
}
