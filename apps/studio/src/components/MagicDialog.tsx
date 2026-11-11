"use client";
import { useEffect, useState, useRef } from "react";
import { X, ScanLine, Plus, Check, Image as ImageIcon } from "lucide-react";
import type { Asset } from "@/lib/project";
import type { PageData } from "@/lib/types";
import {
  analysisSchema,
  regionSchema,
  type Analysis,
  type Region,
} from "@/lib/magic-layers/schema";
import { reconstructDesign, type RepairedSource } from "@/lib/magic-layers/reconstruct";
import { renderPage } from "@/lib/render";
import { uid } from "@/lib/types";
import { prepareAiImageWithMetadata, readApiJson } from "@/lib/ai-transport";
import { stageSchema, statusLabels, warningLabels, assessInventory, type Diagnostic } from "@/lib/magic-layers/diagnostics";
import { download } from "@/lib/archive";
import { adaptivePipeline, profileSource, localProposal, inspectMasks, mergeRegions, type PipelineResult } from "@/lib/magic-layers/adaptive";
import { recordBetaEvent,errorCode } from "@/lib/beta-diagnostics";
import { detectLocalImages } from "@/lib/magic-layers/local-detect";
interface Props {
  source: Asset;
  width: number;
  height: number;
  onClose: () => void;
  onApply: (page: PageData, assets: Asset[], source: Asset, diagnostic: Diagnostic) => void;
}
export default function MagicDialog({
  source,
  width,
  height,
  onClose,
  onApply,
}: Props) {
  const [config, setConfig] = useState<{
    enabled: boolean;
    model: string;
    reason: string;
    candidates?: string[];
  } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>({
    background: { kind: "solid", from: "#FFFFFF", to: "#FFFFFF", angle: 90 },
    regions: [],
    notes: "수동 영역 지정 · AI 분석을 실행하지 않았습니다.",
  });
  const detection = useRef<AbortController | null>(null);
  const [progress,setProgress] = useState<number | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [mode, setMode] = useState<"preserve" | "redraw">("preserve");
  const [inputKind, setInputKind] = useState<Diagnostic["inputKind"]>("unknown");
  const [initialTrace, setInitialTrace] = useState<Partial<Diagnostic>>({});
  const [resultTrace, setResultTrace] = useState<Diagnostic | null>(null);
  const [repair, setRepair] = useState<(RepairedSource & { key: string }) | null>(null);
  const [repairMethod, setRepairMethod] = useState("ns");
  const [textMode, setTextMode] = useState("boxes");
  const repairKey = JSON.stringify([source.id, analysis, skip, repairMethod, textMode]);
  const activeRepair = repair?.key === repairKey ? repair : undefined;
  const [resultWarnings, setResultWarnings] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancellable,setCancellable]=useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [manualColors, setManualColors] = useState<Record<string,string>>({});
  const [preview, setPreview] = useState("");
  const [previewKey, setPreviewKey] = useState("");
  const currentPreviewKey = JSON.stringify([repairKey, confirmed, activeRepair?.key, mode, inputKind]);
  const [provider, setProvider] = useState("manual");
  const [poly, setPoly] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pipeline,setPipeline]=useState<PipelineResult|null>(null);
  const [beforeAutomatic,setBeforeAutomatic]=useState<{analysis:Analysis;skip:string[];provider:string}|null>(null);
  useEffect(()=>()=>detection.current?.abort(),[]);
  useEffect(() => {
    fetch("/api/capabilities")
      .then(async (r) => {
        const data = await readApiJson(r);
        if (!r.ok) throw new Error(r.status===503 ? `AI 설정 누락: ${data.error ?? "Preview 환경변수를 확인하세요."}` : data.error ?? `AI 상태 확인 실패 (${r.status})`);
        return data;
      })
      .then(data=>{setConfig(data);if(!data.enabled)setError(`AI 설정 누락: ${data.reason ?? 'Preview 서버 설정을 확인하세요.'}`);})
      .catch((e) => {
        setError(e.message);
        setConfig({ enabled: false, model: "", reason: "AI 연결을 확인하지 못했습니다." });
      });
  }, []);
  const region = analysis.regions.find((r) => r.id === selected);
  function patch(p: Partial<Region>) {
    recordBetaEvent({feature:'correction',stage:'review',outcome:'ok',code:'none',method:'manual',correction:p.text!==undefined?'text':p.polygon?'polygon':p.bbox?'bbox':'other'});
    setAnalysis((a) => ({
      ...a,
      regions: a.regions.map((r) => (r.id === selected ? { ...r, ...p } : r)),
    }));
    setPreview("");
  }
  async function requestAnalysis(signal?:AbortSignal) {
    if(!consent||!config?.enabled)throw new Error('외부 분석 사용 동의와 연결 상태를 확인하세요.');
    const {image,transport}=await prepareAiImageWithMetadata(source.dataUrl);signal?.throwIfAborted();
    const response=await fetch('/api/ai/magic-layers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,consent,...(selectedModel?{model:selectedModel}:{})}),signal});
    const data=await readApiJson(response);if(!response.ok)throw new Error(response.status===503?`AI 설정 누락: ${data.error??'Preview 환경변수를 확인하세요.'}`:data.error??'분석 실패');
    const parsed = analysisSchema.parse(data.analysis);
    return {analysis:{...parsed,regions:parsed.regions.map(r=>({...r,manualBackground:undefined}))},provider:`gemini/${data.provenance.model}`,trace:{runId:uid('run'),transport,build:typeof data.trace?.build==='string'?data.trace.build:'unknown',stages:data.trace?.stages?stageSchema.array().parse(data.trace.stages):undefined}};
  }
  async function analyze() {
    setBusy(true);setError('');const controller=new AbortController();detection.current=controller;setCancellable(true);
    const deadline=setTimeout(()=>controller.abort(),120000);
    try{
      const result=await requestAnalysis(controller.signal);controller.signal.throwIfAborted();
      const merged=mergeRegions(analysis.regions,result.analysis.regions);
      setBeforeAutomatic({analysis,skip,provider});
      setAnalysis(analysis.regions.length?{...analysis,regions:merged.regions}:{...result.analysis,regions:merged.regions});
      setInitialTrace(analysis.regions.length?{}:result.trace);setProvider(result.provider);setSelected(merged.regions[0]?.id??'');
      setConfirmed(false);setPreview('');setPipeline(null);
      setResultWarnings(merged.protectedCount?['기존 교정 영역과 겹치는 AI 후보는 적용하지 않았습니다.']:[]);
      recordBetaEvent({feature:'analysis',stage:'ai',outcome:'ok',code:'none',method:'gemini',count:merged.regions.length});
    }catch(e){setError(controller.signal.aborted?'분석을 취소하거나 시간 한도에 도달했습니다. 기존 영역은 유지됩니다.':e instanceof Error?e.message:'분석 실패');recordBetaEvent({feature:'analysis',stage:'ai',outcome:controller.signal.aborted?'cancelled':'error',code:errorCode(e),method:'gemini'});}
    finally{clearTimeout(deadline);setBusy(false);detection.current=null;setCancellable(false);}
  }
  async function smartProcess(){
    setBusy(true);setError('');setProgress(0);const controller=new AbortController();detection.current=controller;setCancellable(true);
    const deadline=setTimeout(()=>controller.abort(),120000);
    try{
      const flat=await profileSource(source,controller.signal);
      const result=await adaptivePipeline({existing:analysis,flat,allowAI:consent&&Boolean(config?.enabled),signal:controller.signal,
        local:(method,existing)=>localProposal(source,method,existing,controller.signal,setProgress),
        ai:async()=>(await requestAnalysis(controller.signal)).analysis,
        inspect:regions=>inspectMasks(regions,controller.signal),
        onStage:method=>recordBetaEvent({feature:'analysis',stage:method==='gemini'?'ai':method==='legacy'?'legacy':'local',outcome:'review',code:'none',method})});
      controller.signal.throwIfAborted();setBeforeAutomatic({analysis,skip,provider});setAnalysis(result.analysis);setPipeline(result);setProvider('adaptive-pipeline');setInitialTrace({});
      setConfirmed(false);setPreview('');setResultWarnings(result.warnings);setSelected(result.analysis.regions[0]?.id??'');
      for(const attempt of result.attempts)recordBetaEvent({feature:'analysis',stage:attempt.method==='gemini'?'ai':attempt.method==='legacy'?'legacy':'local',outcome:attempt.result==='error'?'error':attempt.result==='empty'?'fallback':'ok',code:attempt.result==='error'?'unknown':attempt.result==='empty'?'empty':'none',method:attempt.method,count:attempt.added});
    }catch(e){setError(controller.signal.aborted?'처리를 취소하거나 시간 한도에 도달했습니다. 기존 교정과 원본은 유지됩니다.':e instanceof Error?e.message:'자동 처리 실패. 영역을 직접 지정하세요.');recordBetaEvent({feature:'analysis',stage:'profile',outcome:controller.signal.aborted?'cancelled':'error',code:errorCode(e)});}
    finally{clearTimeout(deadline);setBusy(false);setProgress(null);detection.current=null;setCancellable(false);}
  }
  async function localDetect() {
    setBusy(true);setError("");setProgress(0);
    const controller=new AbortController();detection.current=controller;setCancellable(true);
    try {
      const regions=await detectLocalImages(source,analysis.regions,controller.signal,setProgress);
      setAnalysis(a=>({...a,regions:[...a.regions,...regions],notes:(a.notes+"\n로컬 픽셀 후보: 내부 밝은 색·그림자·겹침 경계가 누락될 수 있습니다. 자동 의미 인식 또는 정확한 분리가 아닙니다.").slice(0,2000)}));setPreview("");
      if (provider === "manual") setProvider("local-pixel-candidates");
      setResultWarnings([`로컬 전경 후보 ${regions.length}개. 의미 인식 결과가 아니며 내부 흰색·그림자·겹침이 빠질 수 있습니다. 마스크와 배경을 검토하세요.`]);
    } catch(e) {setError(controller.signal.aborted?"후보 탐지를 취소했습니다. 기존 영역은 유지됩니다.":e instanceof Error?e.message:"후보 탐지 실패");}
    finally {setBusy(false);setProgress(null);detection.current=null;setCancellable(false);}
  }
  function add(type: Region["type"]) {
    const r: Region = {
      id: uid("region"),
      type,
      bbox: [100, 100, 300, 180],
      zIndex: analysis.regions.length,
      review: true,
      ...(type === "text"
        ? {
            text: "원문을 확인해 입력",
            style: { color: "#172C35", fontSize: 65, align: "left" as const },
          }
        : type === "shape"
          ? { shape: "rect" as const, style: { color: "#32857A" } }
          : {}),
    };
    setAnalysis((a) => ({ ...a, regions: [...a.regions, r] }));
    setSelected(r.id);
    setPreview("");
  }
  async function reconstruct(apply: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await reconstructDesign(
        analysis,
        source,
        width,
        height,
        skip,
        confirmed,
        provider,
        activeRepair,
        { mode, inputKind, initial: initialTrace },
      );
      setResultWarnings(result.warnings);
      setResultTrace(result.diagnostic);
      const editableCount = result.page.elements.filter(e=>e.provenance?.regionId).length;
      recordBetaEvent({feature:'preview',stage:apply?'apply':'review',outcome:'review',code:result.diagnostic.status==='original-preserved'?'source-preserved':'none',count:editableCount});
      if (apply && !editableCount) throw new Error("편집 레이어가 0개여서 적용할 수 없습니다. 영역과 배경을 교정하세요.");
      if (apply) {
        onApply(result.page, result.assets, source, result.diagnostic);
        onClose();
      } else {
        setPreview(await renderPage(result.page, width, height));
        setPreviewKey(currentPreviewKey);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "레이어 생성 실패");
      recordBetaEvent({feature:'preview',stage:'review',outcome:'error',code:errorCode(e)});
    } finally {
      setBusy(false);
    }
  }
  async function repairBackground() {
    setBusy(true);
    setError("");
    setPreview("");
    try {
      const response = await fetch("/api/magic-layers/background", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: source.dataUrl, analysis, skip,
          method: repairMethod, textMode, padding: 3 }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error ?? "로컬 보정 실패");
      setRepair({ ...data, key: repairKey });
      recordBetaEvent({feature:'background',stage:'apply',outcome:'review',code:'mask-risk'});
    } catch (e) {
      recordBetaEvent({feature:'background',stage:'apply',outcome:'error',code:errorCode(e)});
      setRepair(null);
      setError(e instanceof Error ? e.message : "로컬 보정 실패");
    } finally { setBusy(false); }
  }
  function finishPolygon() {
    try {
      if (!region) throw new Error("이미지 영역을 선택하세요.");
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      const bbox: [number, number, number, number] = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ];
      const r = regionSchema.parse({ ...region, polygon: points, maskPng: undefined, bbox });
      patch({...r,manualBackground:undefined});
      setPoly(false);
      setPoints([]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "마스크 오류");
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="magic-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Magic Layers 검토"
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">이미지 → 편집 레이어</span>
            <h2>
              <ScanLine size={22} /> Magic Layers
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Magic Layers 닫기"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div className="magic-body">
          <div className="notice">
            <strong>원본을 보존하며 필요한 부분부터 편집하세요.</strong>
            <details><summary>자동 처리 방식</summary><p>단색 배경은 로컬 우선, 복잡한 이미지는 동의 후 AI 분석을 사용합니다. 실패 시 로컬 방법으로 전환합니다. 결과를 검토한 뒤 적용하세요.</p></details>
            <button className="primary" disabled={busy} onClick={()=>void smartProcess()}>자동 처리 시작</button>
            {busy&&cancellable&&<button onClick={()=>detection.current?.abort()}>자동 처리 취소</button>}
            {beforeAutomatic&&<button disabled={busy} onClick={()=>{setAnalysis(beforeAutomatic.analysis);setSkip(beforeAutomatic.skip);setProvider(beforeAutomatic.provider);setInitialTrace({});setRepair(null);setPreview('');setPipeline(null);setConfirmed(false);setBeforeAutomatic(null);}}>자동 처리 전 영역으로 되돌리기</button>}
            {pipeline&&<div aria-label="자동 처리 결과"><p>{pipeline.route==='flat'?'단색 둘레':'복잡한 둘레'} · {pipeline.attempts.length}개 경로 시도 · 검토할 영역 {pipeline.analysis.regions.length}개</p><ul>{pipeline.attempts.map(a=><li key={a.method}>{a.method==='gemini'?'AI':a.method==='legacy'?'기존 로컬':'배경 기준 로컬'}: {a.result==='error'?'실패 → 대체 경로':a.result==='empty'?'새 후보 없음':`새 후보 ${a.added}개`}</li>)}</ul></div>}
          </div>
          <div className="magic-top">
            <div className="notice">
              <strong>
                {config?.enabled
                  ? "Gemini 분석 준비"
                  : (config?.reason ?? "AI 연결 상태 확인 중")}
              </strong>
              <details><summary>모델·무료 한도·전송 정책</summary><p>
                모델별 1회 요청 · 429 할당량 초과 시 다음 무료 후보로 전환합니다. 최대 3회이며 그 밖의 오류는 재시도하지 않습니다. 계정별 비용·무료 쿼터가
                적용되며 확정 금액을 예측하지 않습니다. 원본은 이 버튼을 누를
                때 또는 동의 후 자동 처리가 AI 경로를 선택할 때 외부로 전송합니다.
              </p>
              {config?.candidates && <label>무료 분석 모델
                <select aria-label="무료 분석 모델" value={selectedModel || config.model} disabled={busy} onChange={e => setSelectedModel(e.target.value)}>
                  {config.candidates.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>}
              </details><label>
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                외부 Gemini API로 이미지 전송에 동의합니다.
              </label>
              <p>민감한 개인정보·업무 기밀은 무료 티어에 전송하지 마세요.</p>
            </div>
            <button
              className="primary"
              disabled={!config?.enabled || !consent || busy}
              onClick={() => void analyze()}
            >
              {busy ? "처리 중…" : "AI 레이어 분해"}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="magic-grid">
            <div className="comparison">
              <div className="section-label">
                원본 · 클릭으로 다각형 꼭짓점 지정{" "}
                <button onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}>
                  {zoom === 1 ? "2× 확대" : "맞춤"}
                </button>
              </div>
              <div className="compare-scroll">
                <div style={{ position: "relative", width: `${zoom * 100}%` }}>
                  <img
                    className="original-preview"
                    src={source.dataUrl}
                    alt="분해 원본"
                  />
                  <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    className={
                      poly ? "region-overlay drawing" : "region-overlay"
                    }
                    onClick={(e) => {
                      if (busy || !poly) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPoints((p) => [
                        ...p,
                        [
                          Math.round(
                            ((e.clientX - rect.left) / rect.width) * 1000,
                          ),
                          Math.round(
                            ((e.clientY - rect.top) / rect.height) * 1000,
                          ),
                        ],
                      ]);
                    }}
                  >
                    {analysis.regions.map((r) => (
                      <g
                        key={r.id}
                        onClick={(e) => {
                          if (!busy && !poly) {
                            e.stopPropagation();
                            setSelected(r.id);
                          }
                        }}
                        opacity={skip.includes(r.id) ? 0.2 : 1}
                      >
                        <rect
                          x={r.bbox[0]}
                          y={r.bbox[1]}
                          width={r.bbox[2]}
                          height={r.bbox[3]}
                          fill="transparent"
                          stroke={r.id === selected ? "#D46C43" : "#32857A"}
                          strokeWidth={r.id === selected ? 5 : 2}
                        />
                        {r.polygon && (
                          <polygon
                            points={r.polygon.map((p) => p.join(",")).join(" ")}
                            fill="#32857A33"
                            stroke="#32857A"
                            strokeWidth={3}
                          />
                        )}
                      </g>
                    ))}
                    {points.length > 0 && (
                      <polyline
                        points={points.map((p) => p.join(",")).join(" ")}
                        fill="#D46C4333"
                        stroke="#D46C43"
                        strokeWidth={4}
                      />
                    )}
                  </svg>
                </div>
              </div>
              <div className="section-label">
                변환 미리보기 · 원본과 확대 비교
              </div>
              {preview && previewKey === currentPreviewKey ? (
                <div className="compare-scroll">
                  <img
                    style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                    src={preview}
                    alt="레이어 변환 결과"
                  />
                </div>
              ) : (
                <div className="preview-empty">
                  영역을 검토한 뒤 ‘결과 미리보기’를 누르세요.
                </div>
              )}
            </div>
            <div className="region-controls">
              <label>입력 이미지 종류
                <select aria-label="입력 이미지 종류" value={inputKind} onChange={e=>setInputKind(e.target.value as Diagnostic["inputKind"])}>
                  <option value="unknown">미확인</option><option value="text-only">텍스트만 있음</option><option value="illustrated">삽화·아이콘이 있음</option>
                </select>
              </label>
              {assessInventory(analysis.regions,inputKind).map(code=><p className="warning" key={code}>{warningLabels[code]}</p>)}
              <div className="section-label">
                영역 검토 ·{" "}
                {provider.startsWith("gemini")
                  ? "Gemini · 모든 결과 확인 필요"
                  : provider === "adaptive-pipeline" ? "자동 경로 · 후보 검토 필요" : provider === "local-pixel-candidates" ? "로컬 픽셀 후보 · 의미 인식 아님" : "수동 지정 · AI 결과 아님"}
              </div>
              <div className="button-row">
                <button disabled={busy} onClick={()=>void localDetect()}>로컬 전경 후보 찾기</button>
                {progress!==null && <><span role="status">후보 검사 {progress}%</span><button onClick={()=>detection.current?.abort()}>탐지 취소</button></>}
                <button onClick={() => add("text")}>
                  <Plus size={14} />
                  텍스트 영역
                </button>
                <button onClick={() => add("shape")}>도형 영역</button>
                <button onClick={() => add("image")}>
                  <ImageIcon size={14} />
                  이미지 영역
                </button>
              </div>
              <div className="region-list">
                {analysis.regions.length === 0 && (
                  <p>
                    AI 키 없이도 원본을 보며 영역을 직접 지정할 수 있습니다.
                  </p>
                )}
                {analysis.regions.map((r) => (
                  <div
                    key={r.id}
                    className={`region-row ${selected === r.id ? "active" : ""}`}
                  >
                    <input
                      aria-label={`${r.id} 채택`}
                      type="checkbox"
                      checked={!skip.includes(r.id)}
                      onChange={() =>
                        setSkip((ids) =>
                          ids.includes(r.id)
                            ? ids.filter((i) => i !== r.id)
                            : [...ids, r.id],
                        )
                      }
                    />
                    <button
                      onClick={() => {
                        setSelected(r.id);
                        setPoly(false);
                        setPoints([]);
                      }}
                    >
                      {r.type === "text" ? r.text : (r.shape ?? "이미지")}
                      <small>
                        {r.type === "image"
                          ? r.polygon || r.maskPng
                            ? "마스크 경계 확인 필요"
                            : "근사 크롭"
                          : "확인 필요"}
                      </small>
                    </button>
                  </div>
                ))}
              </div>
              {region && (
                <fieldset>
                  <legend>선택 영역 수정 · 좌표 0–1000</legend>
                  <div className="field-grid">
                    {["X", "Y", "너비", "높이"].map((label, i) => (
                      <label key={label}>
                        {label}
                        <input
                          aria-label={`영역 ${label}`}
                          type="number"
                          min="0"
                          max="1000"
                          value={region.bbox[i]}
                          onChange={(e) => {
                            const b = [...region.bbox] as Region["bbox"];
                            b[i] = Number(e.target.value);
                            patch({ bbox: b, polygon: undefined, maskPng: undefined, manualBackground: undefined });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {region.type === "text" && (
                    <>
                      <label>
                        원문 확인·수정
                        <textarea
                          aria-label="인식 텍스트 수정"
                          value={region.text ?? ""}
                          onChange={(e) => patch({ text: e.target.value })}
                        />
                      </label>
                      <label>
                        글자 크기 (이미지 높이 /1000)
                        <input
                          type="number"
                          value={region.style?.fontSize ?? 50}
                          onChange={(e) =>
                            patch({
                              style: {
                                ...region.style,
                                color: region.style?.color ?? "#172C35",
                                fontSize: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <div className="field-grid">
                        <label>행간<input aria-label="영역 텍스트 행간" type="number" min="0.5" max="5" step="0.05"
                          value={region.style?.lineHeight ?? 1.25} onChange={e=>patch({style:{...region.style,color:region.style?.color??"#172C35",lineHeight:Number(e.target.value)}})}/></label>
                        <label>자간 (높이 /1000)<input aria-label="영역 텍스트 자간" type="number" min="-100" max="100" step="0.1"
                          value={region.style?.letterSpacing ?? 0} onChange={e=>patch({style:{...region.style,color:region.style?.color??"#172C35",letterSpacing:Number(e.target.value)}})}/></label>
                      </div>
                      <label><input type="checkbox" aria-label="영역 텍스트 굵게" checked={region.style?.bold??false}
                        onChange={e=>patch({style:{...region.style,color:region.style?.color??"#172C35",bold:e.target.checked}})}/>굵게</label>
                      <label>정렬<select aria-label="영역 텍스트 정렬" value={region.style?.align??"left"} onChange={e=>patch({style:{...region.style,color:region.style?.color??"#172C35",align:e.target.value as "left"|"center"|"right"}})}>
                        <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
                      </select></label>
                    </>
                  )}
                  {region.type === "shape" && (
                    <label>
                      도형
                      <select
                        aria-label="영역 도형"
                        value={region.shape}
                        onChange={(e) =>
                          patch({ shape: e.target.value as Region["shape"] })
                        }
                      >
                        <option value="rect">사각형</option>
                        <option value="rounded-rect">둥근 사각형</option>
                        <option value="ellipse">원</option>
                        <option value="line">선</option>
                      </select>
                    </label>
                  )}
                  {region.type !== "image" && (
                    <label>
                      색
                      <input
                        type="color"
                        value={region.style?.color ?? "#172C35"}
                        onChange={(e) =>
                          patch({
                            style: { ...region.style, color: e.target.value },
                          })
                        }
                      />
                    </label>
                  )}
                  <fieldset>
                    <legend>수동 배경 교정 · 선택 영역만 단색으로 지우기</legend>
                    <p>좌표·마스크를 먼저 교정하세요. 지정한 사각 영역의 원본을 지운 뒤 편집 객체로 교체합니다. 질감·그림자는 복원하지 않습니다. 다른 객체와 충돌하는 영역은 계속 차단합니다.</p>
                    <label>수동 교정 배경색<input aria-label="수동 교정 배경색" type="color" value={manualColors[region.id]??region.manualBackground?.color??analysis.background.from}
                      onChange={e=>{setManualColors(c=>({...c,[region.id]:e.target.value}));patch({manualBackground:undefined});}}/></label>
                    <label><input aria-label="선택 영역 수동 배경 교정 확인" type="checkbox" checked={Boolean(region.manualBackground)}
                      onChange={e=>patch({manualBackground:e.target.checked?{color:manualColors[region.id]??analysis.background.from,confirmed:true}:undefined})}/>이 영역의 배경을 지정한 단색으로 교체하고 잔상을 검토하겠습니다.</label>
                  </fieldset>
                  <label>
                    겹침 순서
                    <input
                      aria-label="영역 순서"
                      type="number"
                      value={region.zIndex}
                      onChange={(e) =>
                        patch({ zIndex: Number(e.target.value) })
                      }
                    />
                  </label>
                  {region.type === "image" && (
                    <label><input type="checkbox" aria-label="단색 경계 배경색 보정" disabled={!region.maskPng}
                      checked={Boolean(region.edgeRefinement)} onChange={e=>patch({edgeRefinement:e.target.checked})}/>
                      단색 경계 배경색 보정 · 한 픽셀 경계의 근사 alpha, 내부 색상 보존
                    </label>
                  )}
                  {region.type === "image" && (
                    <div className="button-row">
                      <button
                        onClick={() => {
                          setPoly(true);
                          setPoints([]);
                        }}
                      >
                        다각형 다시 지정
                      </button>
                      <button onClick={() => patch({ polygon: undefined, maskPng: undefined })}>
                        마스크 제거
                      </button>
                      {poly && (
                        <button onClick={finishPolygon}>
                          꼭짓점 확정 ({points.length})
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>
              )}
              <fieldset>
                <legend>배경 복원</legend>
                <label>원본 보존 방식
                  <select aria-label="원본 보존 방식" value={mode} onChange={e=>{setMode(e.target.value as "preserve" | "redraw");setConfirmed(false);setPreview("");}}>
                    <option value="preserve">원본 보존 · 확인한 단색 영역만 부분 편집</option>
                    <option value="redraw">전체 배경 재작성 · 미탐지 장식 손실 위험</option>
                  </select>
                </label>
                <p>기본 모드는 겹치거나 배경이 불확실한 영역을 원본에 남깁니다. 원본 글자를 제거하지 못하면 새 글자를 겹치지 않습니다. 선택 영역 안의 미탐지 장식은 지워질 수 있으므로 미리보기에서 반드시 확인하세요.</p>
                <label>로컬 복원 알고리즘
                  <select aria-label="로컬 복원 알고리즘" value={repairMethod} onChange={e => setRepairMethod(e.target.value)}>
                    <option value="telea">Telea</option><option value="ns">Navier–Stokes</option>
                  </select>
                </label>
                <label>텍스트 제거 영역
                  <select aria-label="텍스트 제거 영역" value={textMode} onChange={e => setTextMode(e.target.value)}>
                    <option value="boxes">전체 텍스트 영역</option><option value="ink">글자 획 추정</option>
                  </select>
                </label>
                <div className="button-row">
                  <button disabled={busy || analysis.regions.length === skip.length} onClick={() => void repairBackground()}>로컬 배경 보정</button>
                  {activeRepair && <button onClick={() => { setRepair(null); setPreview(""); }}>복원 취소</button>}
                </div>
                {activeRepair && <p role="status">로컬 복원 적용 · {activeRepair.warning}</p>}
                {repair && !activeRepair && <p className="warning">영역·설정이 변경되었습니다. 로컬 배경 보정을 다시 실행하세요.</p>}
                <p>외부 전송 없이 CPU로 처리합니다. 원본은 보존하며 가려진 배경은 근사 추정합니다.</p>
                <label>
                  방식
                  <select
                    aria-label="배경 복원 방식"
                    value={analysis.background.kind}
                    onChange={(e) => {
                      setAnalysis((a) => ({
                        ...a,
                        background: {
                          ...a.background,
                          kind: e.target
                            .value as Analysis["background"]["kind"],
                        },
                      }));
                      setConfirmed(false);
                      setPreview("");
                    }}
                  >
                    <option value="solid">단색 근사 복원</option>
                    <option value="gradient">그라데이션 근사 복원</option>
                    <option value="complex">복잡한 원본 · 보정 필요</option>
                  </select>
                </label>
                <div className="field-grid">
                  <label>
                    시작 색
                    <input
                      aria-label="배경 시작 색"
                      type="color"
                      value={analysis.background.from}
                      onChange={(e) =>
                        setAnalysis((a) => ({
                          ...a,
                          background: { ...a.background, from: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    끝 색
                    <input
                      type="color"
                      value={analysis.background.to}
                      onChange={(e) =>
                        setAnalysis((a) => ({
                          ...a,
                          background: { ...a.background, to: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    각도
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={analysis.background.angle}
                      onChange={(e) =>
                        setAnalysis((a) => ({
                          ...a,
                          background: {
                            ...a.background,
                            angle: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={mode === "redraw" && analysis.background.kind === "complex"}
                    onChange={(e) => {
                      setConfirmed(e.target.checked);
                      setPreview("");
                    }}
                  />{" "}
                  {mode === "preserve" ? "선택 영역이 단색 배경이며, 국소 제거 결과를 미리보기로 검토하겠습니다." : "원본 배경을 단색/그라데이션으로 근사 재구성함을 확인했습니다."}
                </label>
                <p className="warning">
                  {mode === "preserve" ? "전체 디자인은 보존합니다. 국소 배경은 추정이며, 제외·중첩 영역은 원본 유지 상태입니다."
                  : !confirmed || analysis.background.kind === "complex"
                    ? "배경 보정 필요 · 원본에 글자·객체 잔상이 남을 수 있습니다. 정확한 분리가 아닙니다."
                    : "원본 배경을 새로 그립니다. 가려진 디테일·제외한 영역은 복원하지 않습니다."}
                </p>
              </fieldset>
              {resultWarnings.map(w => <p className="warning" key={w}>{w}</p>)}
              {resultTrace && previewKey === currentPreviewKey && <div role="status">
                <p>실제 편집 가능 레이어: {resultTrace.stages.find(s=>s.name==="reconstructed")?.objects.filter(o=>o.role==="editable").length ?? 0}개</p>
                <ul>{resultTrace.stages.find(s=>s.name==="reconstructed")?.omitted.map(o=><li key={o.id}>{o.id}: {({"unreviewed":"배경 확인 필요","overlap":"다른 객체와 충돌 — 경계 또는 채택 영역 교정","complex-boundary":"복잡한 경계 — 수동 배경 교정 필요","large-or-edge":"크기·가장자리 — 수동 교정 필요","user-excluded":"사용자 제외","original-preserved":"배경 보정 필요"} as Record<string,string>)[o.reason??""]??o.reason}</li>)}</ul>
                <strong>{statusLabels[resultTrace.status]}</strong>
                {resultTrace.warnings.map(w=><p className="warning" key={w}>{warningLabels[w]??w}</p>)}
                <button onClick={()=>download(new Blob([JSON.stringify(resultTrace,null,2)],{type:"application/json"}),"magic-diagnostic.json")}>변환 진단 JSON</button>
              </div>}
              <p className="muted">{analysis.notes}</p>
            </div>
          </div>
          </fieldset>
        </div>
        <footer className="dialog-footer">
          <span>결과는 새 페이지에 추가되어 원본 페이지를 보존합니다.</span>
          <button
            disabled={busy || analysis.regions.length === 0}
            onClick={() => void reconstruct(false)}
          >
            결과 미리보기
          </button>
          <button
            className="primary"
            disabled={busy || resultTrace?.status === "original-preserved" || analysis.regions.length === skip.length || previewKey !== currentPreviewKey || !preview}
            onClick={() => void reconstruct(true)}
          >
            <Check size={16} />
            검토한 레이어 생성
          </button>
        </footer>
      </section>
    </div>
  );
}
