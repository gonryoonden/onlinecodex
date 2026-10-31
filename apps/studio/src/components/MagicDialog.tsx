"use client";
import { useEffect, useState } from "react";
import { X, ScanLine, Plus, Check, Image as ImageIcon } from "lucide-react";
import type { Asset } from "@/lib/project";
import type { PageData } from "@/lib/types";
import {
  analysisSchema,
  regionSchema,
  type Analysis,
  type Region,
} from "@/lib/magic-layers/schema";
import { reconstructDesign } from "@/lib/magic-layers/reconstruct";
import { renderPage } from "@/lib/render";
import { uid } from "@/lib/types";
interface Props {
  source: Asset;
  width: number;
  height: number;
  onClose: () => void;
  onApply: (page: PageData, assets: Asset[], source: Asset) => void;
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
  } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>({
    background: { kind: "solid", from: "#FFFFFF", to: "#FFFFFF", angle: 90 },
    regions: [],
    notes: "수동 영역 지정 · AI 분석을 실행하지 않았습니다.",
  });
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState("");
  const [provider, setProvider] = useState("manual");
  const [poly, setPoly] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    fetch("/api/capabilities")
      .then(async (r) => {
        if (!r.ok) throw new Error("AI 상태 확인 실패");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const region = analysis.regions.find((r) => r.id === selected);
  function patch(p: Partial<Region>) {
    setAnalysis((a) => ({
      ...a,
      regions: a.regions.map((r) => (r.id === selected ? { ...r, ...p } : r)),
    }));
    setPreview("");
  }
  async function analyze() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/magic-layers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: source.dataUrl, consent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "분석 실패");
      const parsed = analysisSchema.parse(data.analysis);
      setAnalysis(parsed);
      setProvider(`gemini/${data.provenance.model}`);
      setSelected(parsed.regions[0]?.id ?? "");
      setSkip([]);
      setConfirmed(false);
      setPreview("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setBusy(false);
    }
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
      );
      if (apply) {
        onApply(result.page, result.assets, source);
        onClose();
      } else setPreview(await renderPage(result.page, width, height));
    } catch (e) {
      setError(e instanceof Error ? e.message : "레이어 생성 실패");
    } finally {
      setBusy(false);
    }
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
      const r = regionSchema.parse({ ...region, polygon: points, bbox });
      patch(r);
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
          <div className="magic-top">
            <div className="notice">
              <strong>
                {config?.enabled
                  ? "Gemini 분석 준비"
                  : (config?.reason ?? "AI 연결 상태 확인 중")}
              </strong>
              <p>
                분석 요청 1회 · 오류 시 최대 2회 재시도. 계정별 비용·무료 쿼터가
                적용되며 확정 금액을 예측하지 않습니다. 원본은 이 버튼을 누를
                때만 외부로 전송합니다.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
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
          <div className="magic-grid">
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
                      if (!poly) return;
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
                          if (!poly) {
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
              {preview ? (
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
              <div className="section-label">
                영역 검토 ·{" "}
                {provider.startsWith("gemini")
                  ? "Gemini · 모든 결과 확인 필요"
                  : "수동 지정 · AI 결과 아님"}
              </div>
              <div className="button-row">
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
                          ? r.polygon
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
                            patch({ bbox: b, polygon: undefined });
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
                    <div className="button-row">
                      <button
                        onClick={() => {
                          setPoly(true);
                          setPoints([]);
                        }}
                      >
                        다각형 다시 지정
                      </button>
                      <button onClick={() => patch({ polygon: undefined })}>
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
                    disabled={analysis.background.kind === "complex"}
                    onChange={(e) => {
                      setConfirmed(e.target.checked);
                      setPreview("");
                    }}
                  />{" "}
                  원본 배경을 단색/그라데이션으로 근사 재구성함을 확인했습니다.
                </label>
                <p className="warning">
                  {!confirmed || analysis.background.kind === "complex"
                    ? "배경 보정 필요 · 원본에 글자·객체 잔상이 남을 수 있습니다. 정확한 분리가 아닙니다."
                    : "원본 배경을 새로 그립니다. 가려진 디테일·제외한 영역은 복원하지 않습니다."}
                </p>
              </fieldset>
              <p className="muted">{analysis.notes}</p>
            </div>
          </div>
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
            disabled={busy || analysis.regions.length === skip.length}
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
