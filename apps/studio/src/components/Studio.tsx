"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Type,
  Square,
  Circle,
  Minus,
  Upload,
  Layers,
  ScanLine,
  Download,
  Save,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  FolderOpen,
  X,
  ArrowLeft,
  ArrowRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Palette,
} from "lucide-react";
import { useEditorStore } from "@/store/editor-store";
import {
  createTextElement,
  createShapeElement,
  createLineElement,
} from "@/lib/types";
import {
  newProject,
  validateProject,
  type Project,
  type Asset,
} from "@/lib/project";
import { listProjects, saveProject } from "@/lib/storage";
import { imageAsset, pdfImporter, placeAsset } from "@/lib/imports";
import { download, projectZip, importZip, fromDataURL } from "@/lib/archive";
import { exportPDF, renderPage } from "@/lib/render";
import StudioCanvas from "./canvas/StudioCanvas";
import MagicDialog from "./MagicDialog";
function message(e: unknown) {
  return e instanceof Error ? e.message : "작업을 완료하지 못했습니다.";
}
export default function Studio() {
  const s = useEditorStore();
  const meta = useRef<Project | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [projectMeta, setProjectMeta] = useState<Project | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("저장소를 여는 중");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [library, setLibrary] = useState<Project[] | null>(null);
  const [magic, setMagic] = useState<Asset | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState("elements");
  const file = useRef<HTMLInputElement>(null);
  const archive = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });
  const capture = useCallback(() => {
    if (!meta.current) throw new Error("프로젝트를 먼저 여세요.");
    const store = useEditorStore.getState();
    const livePages = store.pages.map((page) => ({
      ...page,
      elements: page.elements.map((el) =>
        el.type === "image" && el.assetId
          ? { ...el, src: meta.current!.assets[el.assetId]?.dataUrl ?? el.src }
          : el,
      ),
    }));
    return validateProject({
      ...meta.current,
      name: store.designName,
      width: store.width,
      height: store.height,
      pages: livePages,
      sources: Object.fromEntries(
        Object.entries(meta.current.sources).filter(([pid]) =>
          livePages.some((p) => p.id === pid),
        ),
      ),
      updatedAt: new Date().toISOString(),
    });
  }, []);
  const save = useCallback(async () => {
    try {
      const p = capture();
      const pages = useEditorStore.getState().pages;
      setStatus("저장 중…");
      const pending = queue.current.catch(() => {}).then(() => saveProject(p));
      queue.current = pending;
      await pending;
      if (meta.current?.id === p.id) {
        meta.current = { ...meta.current, updatedAt: p.updatedAt };
        const live = useEditorStore.getState();
        if (
          live.pages === pages &&
          live.designName === p.name &&
          live.width === p.width &&
          live.height === p.height
        ) {
          live.markSaved();
          setStatus("이 브라우저에 저장됨");
        }
      }
    } catch (e) {
      setStatus("저장 실패 · ZIP 백업 필요");
      setError(message(e));
      throw e;
    }
  }, [capture]);
  function open(p: Project) {
    meta.current = p;
    setProjectMeta(p);
    useEditorStore.getState().loadDesign(p);
    setSize({ width: p.width, height: p.height });
    setStatus("이 브라우저에 저장됨");
    setError("");
    setLibrary(null);
    try {
      localStorage.setItem("studio-active", p.id);
    } catch {}
  }
  useEffect(() => {
    let active = true;
    void listProjects()
      .then(async (items) => {
        if (!active) return;
        let id: string | null = null;
        try {
          id = localStorage.getItem("studio-active");
        } catch {}
        const p = items.find((i) => i.id === id) ?? items[0] ?? newProject();
        if (!items.length) await saveProject(p);
        if (!active) return;
        meta.current = p;
        setProjectMeta(p);
        useEditorStore.getState().loadDesign(p);
        setSize({ width: p.width, height: p.height });
        setReady(true);
        setStatus("이 브라우저에 저장됨");
      })
      .catch((e) => {
        if (active) {
          setError(message(e));
          setStatus("저장소 연결 실패 · 편집 후 ZIP 백업");
          const p = newProject();
          meta.current = p;
          setProjectMeta(p);
          useEditorStore.getState().loadDesign(p);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((next, prev) => {
      if (!meta.current || next.designId !== meta.current.id) return;
      if (
        next.pages !== prev.pages ||
        next.designName !== prev.designName ||
        next.width !== prev.width ||
        next.height !== prev.height
      ) {
        setStatus("변경사항 저장 대기");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void save().catch(() => {});
        }, 350);
      }
    });
    const flush = () => {
      if (useEditorStore.getState().dirty) void save().catch(() => {});
    };
    const before = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", before);
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", before);
    };
  }, [save]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const editing =
        e.target instanceof HTMLElement &&
        Boolean(e.target.closest("input,textarea,select,[contenteditable]"));
      const store = useEditorStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save().catch(() => {});
        return;
      }
      if (editing || magic || library) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
        }
        if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          store.duplicateSelection();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.deleteSelection();
      } else if (e.key === "Escape") store.clearSelection();
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        store.pushHistory();
        for (const el of store.pages[store.currentPage].elements.filter(
          (el) => store.selectedIds.includes(el.id) && !el.locked,
        )) {
          const delta = e.shiftKey ? 10 : 1;
          store.updateElementsLive([el.id], {
            x:
              el.x +
              (e.key === "ArrowLeft"
                ? -delta
                : e.key === "ArrowRight"
                  ? delta
                  : 0),
            y:
              el.y +
              (e.key === "ArrowUp"
                ? -delta
                : e.key === "ArrowDown"
                  ? delta
                  : 0),
          });
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [magic, library, save]);
  function addAsset(a: Asset) {
    if (meta.current) {
      meta.current = {
        ...meta.current,
        assets: { ...meta.current.assets, [a.id]: a },
      };
      setProjectMeta(meta.current);
    }
  }
  async function importFile(f: File) {
    setBusy(true);
    setError("");
    try {
      if (pdfImporter.accepts(f)) {
        const result = await pdfImporter.import(f, s.width, s.height);
        if (s.pages.length + result.pages.length > 30)
          throw new Error("최대 30페이지입니다.");
        result.assets.forEach(addAsset);
        s.pushHistory();
        const store = useEditorStore.getState();
        const start = store.pages.length;
        useEditorStore.setState({
          pages: [...store.pages, ...result.pages],
          currentPage: start,
          selectedIds: [],
          dirty: true,
        });
        result.pages.forEach((p, i) => {
          if (meta.current) meta.current.sources[p.id] = result.assets[i].id;
        });
        setNotice(result.notice);
      } else {
        const a = await imageAsset(f);
        addAsset(a);
        if (meta.current)
          meta.current.sources[s.pages[s.currentPage].id] = a.id;
        s.addElement(placeAsset(a, s.width, s.height));
        setNotice(`${a.name} · 원본 ${a.width} × ${a.height}px 보존`);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function importArchive(f: File) {
    setBusy(true);
    setError("");
    try {
      const p = await importZip(f);
      await save();
      p.id = newProject().id;
      p.name = `${p.name} (복원)`.slice(0, 120);
      await saveProject(p);
      open(p);
      setNotice("레이어와 원본 에셋을 복원했습니다.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    try {
      await save();
      const p = newProject("새 디자인", size.width, size.height);
      await saveProject(p);
      open(p);
    } catch (e) {
      setError(message(e));
    }
  }
  async function showLibrary() {
    try {
      await save();
      setLibrary(await listProjects());
    } catch (e) {
      setError(message(e));
    }
  }
  async function output(format: string) {
    setBusy(true);
    setError("");
    setExportOpen(false);
    try {
      const p = capture();
      if (format === "zip")
        download(await projectZip(p), `${p.name}.studio.zip`);
      else if (format === "png")
        download(
          new Blob(
            [
              new Uint8Array(
                fromDataURL(
                  await renderPage(p.pages[s.currentPage], p.width, p.height),
                ),
              ).buffer,
            ],
            { type: "image/png" },
          ),
          `${p.name}-${s.currentPage + 1}.png`,
        );
      else if (format === "pdf") download(await exportPDF(p), `${p.name}.pdf`);
      else {
        const response = await fetch("/api/export/pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "PPTX 출력 실패");
        }
        download(await response.blob(), `${p.name}.pptx`);
      }
      setNotice(`${format.toUpperCase()} 파일을 생성했습니다.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const page = s.pages[s.currentPage];
  const selected = page.elements.filter((el) => s.selectedIds.includes(el.id));
  const el = selected[0];
  const selectedImage = selected.find((e) => e.type === "image");
  const sourceId = selectedImage?.assetId ?? projectMeta?.sources[page.id];
  const source = sourceId ? projectMeta?.assets[sourceId] : undefined;
  function patch(p: Partial<Record<string, unknown>>) {
    s.updateElements(
      selected.filter((e) => !e.locked).map((e) => e.id),
      p,
    );
  }
  function reorderPage(dir: number) {
    const index = s.currentPage,
      target = index + dir;
    if (target < 0 || target >= s.pages.length) return;
    s.pushHistory();
    const pages = [...s.pages];
    [pages[index], pages[target]] = [pages[target], pages[index]];
    useEditorStore.setState({
      pages,
      currentPage: target,
      selectedIds: [],
      dirty: true,
    });
  }
  function duplicatePage() {
    const originalId = page.id;
    s.duplicatePage(s.currentPage);
    const next =
      useEditorStore.getState().pages[useEditorStore.getState().currentPage];
    if (meta.current?.sources[originalId])
      meta.current.sources[next.id] = meta.current.sources[originalId];
  }
  if (!ready)
    return (
      <main className="loading">
        Personal Magic Studio · 로컬 프로젝트를 불러오는 중…
      </main>
    );
  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand" aria-label="Personal Magic Studio">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <span>
            MAGIC<span className="brand-light"> STUDIO</span>
            <small>PERSONAL DESIGN WORKSPACE</small>
          </span>
        </div>
        <div className="project-heading">
          <input
            aria-label="프로젝트 이름"
            value={s.designName}
            maxLength={120}
            onChange={(e) => s.rename(e.target.value || "새 디자인")}
          />
          <span className="save-status">
            <Check size={12} />
            {status}
          </span>
        </div>
        <div className="top-actions">
          <button onClick={() => void showLibrary()}>
            <FolderOpen size={16} />
            프로젝트
          </button>
          <button
            aria-label="되돌리기"
            title="Ctrl+Z"
            onClick={s.undo}
            disabled={!s.past.length}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="다시 실행"
            title="Ctrl+Shift+Z"
            onClick={s.redo}
            disabled={!s.future.length}
          >
            <Redo2 size={17} />
          </button>
          <button onClick={() => void save().catch(() => {})}>
            <Save size={16} />
            저장
          </button>
          <div className="export-wrap">
            <button
              className="primary"
              disabled={busy}
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Download size={16} />
              {busy ? "처리 중…" : "내보내기"}
            </button>
            {exportOpen && (
              <div className="export-menu">
                {[
                  ["png", "PNG · 현재 페이지"],
                  ["pdf", "PDF · 모든 페이지"],
                  ["pptx", "PPTX · 편집 가능한 객체"],
                  ["zip", "프로젝트 ZIP · 재편집 백업"],
                ].map(([f, label]) => (
                  <button key={f} onClick={() => void output(f)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace">
        <nav className="tool-rail" aria-label="디자인 도구">
          {[
            { id: "elements", label: "요소", icon: Square },
            { id: "text", label: "텍스트", icon: Type },
            { id: "uploads", label: "업로드", icon: Upload },
            { id: "background", label: "배경", icon: Palette },
          ].map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => setTool(t.id)}
            >
              <t.icon size={22} />
              <span>{t.label}</span>
            </button>
          ))}
          <button
            className="magic-nav"
            onClick={() => {
              if (source) setMagic(source);
              else {
                setNotice("먼저 이미지를 업로드하고 선택하세요.");
                file.current?.click();
              }
            }}
          >
            <ScanLine size={23} />
            <span>
              Magic
              <br />
              Layers
            </span>
          </button>
          <div className="rail-bottom">
            <span className="local-dot" />
            LOCAL
          </div>
        </nav>
        <aside className="tools-panel">
          <div className="panel-heading">
            <span className="eyebrow">DESIGN TOOLS</span>
            <h2>
              {tool === "elements"
                ? "디자인의 시작"
                : tool === "text"
                  ? "글자로 전하기"
                  : tool === "uploads"
                    ? "내 이미지"
                    : "배경 만들기"}
            </h2>
            <p>
              {tool === "elements"
                ? "필요한 요소를 놓고, 나만의 구성을 만드세요."
                : tool === "text"
                  ? "한글도 선명하게. 글자 하나까지 직접 편집하세요."
                  : tool === "uploads"
                    ? "원본 픽셀을 보존해 이 브라우저에 저장합니다."
                    : "페이지 전체의 분위기를 바꿉니다."}
            </p>
          </div>
          {tool === "elements" && (
            <>
              <div className="section-label">기본 도형</div>
              <div className="shape-grid">
                <button
                  onClick={() =>
                    s.addElement(
                      createShapeElement("rect", {
                        cornerRadius: 0,
                        width: 220,
                        height: 140,
                        fill: "#32857A",
                      }),
                    )
                  }
                >
                  <Square size={34} />
                  <span>사각형</span>
                </button>
                <button
                  onClick={() =>
                    s.addElement(
                      createShapeElement("rect", {
                        cornerRadius: 28,
                        width: 220,
                        height: 140,
                        fill: "#D46C43",
                      }),
                    )
                  }
                >
                  <span className="rounded-icon" />
                  <span>둥근 사각형</span>
                </button>
                <button
                  onClick={() =>
                    s.addElement(
                      createShapeElement("ellipse", {
                        width: 160,
                        height: 160,
                        fill: "#D9AE49",
                      }),
                    )
                  }
                >
                  <Circle size={34} />
                  <span>원</span>
                </button>
                <button onClick={() => s.addElement(createLineElement())}>
                  <Minus size={34} />
                  <span>선</span>
                </button>
              </div>
              <button
                className="wide"
                onClick={() =>
                  s.addElement(
                    createTextElement({
                      text: "나의 새로운 디자인",
                      fontFamily: "Noto Sans KR",
                      fontSize: 42,
                      width: 480,
                      height: 80,
                      align: "left",
                    }),
                  )
                }
              >
                <Type size={17} />
                텍스트 추가
              </button>
              <div className="tip-card">
                <ScanLine size={25} />
                <h3>한 장에서, 여러 레이어로</h3>
                <p>
                  이미지의 글자·도형·객체를 살펴보고 편집할 수 있는 레이어로
                  재구성하세요.
                </p>
                <button
                  onClick={() =>
                    source ? setMagic(source) : file.current?.click()
                  }
                >
                  Magic Layers 열기
                  <ArrowRight size={14} />
                </button>
              </div>
              <p className="muted shortcut">
                Shift+클릭 다중 선택
                <br />
                방향키 이동 · Shift 10px
                <br />
                Ctrl+Z 되돌리기 · Ctrl+D 복제
              </p>
            </>
          )}
          {tool === "text" && (
            <>
              <button
                className="text-preset heading"
                onClick={() =>
                  s.addElement(
                    createTextElement({
                      text: "제목을 입력하세요",
                      fontFamily: "Noto Sans KR",
                      fontSize: 52,
                      bold: true,
                      width: 620,
                      height: 100,
                      align: "left",
                    }),
                  )
                }
              >
                제목 추가
              </button>
              <button
                className="text-preset subheading"
                onClick={() =>
                  s.addElement(
                    createTextElement({
                      text: "부제목을 입력하세요",
                      fontFamily: "Noto Sans KR",
                      fontSize: 30,
                      width: 500,
                      height: 70,
                      align: "left",
                    }),
                  )
                }
              >
                부제목 추가
              </button>
              <button
                className="text-preset"
                onClick={() =>
                  s.addElement(
                    createTextElement({
                      text: "여기에 내용을 입력하세요.\n줄바꿈도 자유롭게 편집하세요.",
                      fontFamily: "Noto Sans KR",
                      fontSize: 22,
                      width: 480,
                      height: 120,
                      align: "left",
                    }),
                  )
                }
              >
                본문 추가
              </button>
              <p className="muted">
                캔버스에서 선택한 뒤 오른쪽 ‘텍스트 내용’을 수정하세요. 두 번
                클릭하면 입력란으로 이동합니다.
              </p>
            </>
          )}
          {tool === "uploads" && (
            <>
              <button
                className="upload-zone"
                onClick={() => file.current?.click()}
              >
                <Upload size={30} />
                <strong>이미지 / PDF 가져오기</strong>
                <span>PNG · JPEG · WebP · PDF</span>
              </button>
              <button className="wide" onClick={() => archive.current?.click()}>
                <FolderOpen size={16} />
                프로젝트 ZIP 가져오기
              </button>
              <p className="muted">
                PDF는 페이지별 이미지로 가져옵니다. 원본 PDF 개체가 자동으로
                편집 객체가 되는 것은 아닙니다.
              </p>
              <div className="asset-list">
                {Object.values(projectMeta?.assets ?? {})
                  .filter((a) => a.original)
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() =>
                        s.addElement(placeAsset(a, s.width, s.height))
                      }
                    >
                      <img src={a.dataUrl} alt={a.name} />
                      <span>
                        {a.name}
                        <small>
                          {a.width} × {a.height}px
                        </small>
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
          {tool === "background" && (
            <>
              <label>
                배경 종류
                <select
                  aria-label="배경 종류"
                  value={page.background.type}
                  onChange={(e) =>
                    s.setPageBackground(
                      e.target.value === "solid"
                        ? { type: "solid", color: "#FFFFFF" }
                        : {
                            type: "gradient",
                            from: "#E1F0EC",
                            to: "#B6D5CC",
                            angle: 90,
                          },
                    )
                  }
                >
                  <option value="solid">단색</option>
                  <option value="gradient">그라데이션</option>
                </select>
              </label>
              {page.background.type === "solid" ? (
                <label>
                  배경색
                  <input
                    aria-label="페이지 배경색"
                    type="color"
                    value={page.background.color}
                    onChange={(e) =>
                      s.setPageBackground({
                        type: "solid",
                        color: e.target.value,
                      })
                    }
                  />
                </label>
              ) : (
                <>
                  <label>
                    시작 색
                    <input
                      type="color"
                      value={page.background.from}
                      onChange={(e) => {
                        if (page.background.type === "gradient")
                          s.setPageBackground({
                            ...page.background,
                            from: e.target.value,
                          });
                      }}
                    />
                  </label>
                  <label>
                    끝 색
                    <input
                      type="color"
                      value={page.background.to}
                      onChange={(e) => {
                        if (page.background.type === "gradient")
                          s.setPageBackground({
                            ...page.background,
                            to: e.target.value,
                          });
                      }}
                    />
                  </label>
                  <label>
                    각도
                    <input
                      type="number"
                      min="-360"
                      max="360"
                      value={page.background.angle}
                      onChange={(e) => {
                        if (page.background.type === "gradient")
                          s.setPageBackground({
                            ...page.background,
                            angle: Number(e.target.value),
                          });
                      }}
                    />
                  </label>
                </>
              )}
              <div className="section-label">새 디자인 크기</div>
              <div className="field-grid">
                <label>
                  너비
                  <input
                    type="number"
                    min="32"
                    max="8000"
                    value={size.width}
                    onChange={(e) =>
                      setSize((z) => ({ ...z, width: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  높이
                  <input
                    type="number"
                    min="32"
                    max="8000"
                    value={size.height}
                    onChange={(e) =>
                      setSize((z) => ({ ...z, height: Number(e.target.value) }))
                    }
                  />
                </label>
              </div>
              <button className="wide" onClick={() => void create()}>
                이 크기로 새 디자인
              </button>
            </>
          )}
        </aside>
        <section
          className="canvas-section"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void importFile(f);
          }}
        >
          <div className="canvas-toolbar">
            <span>
              {s.width} × {s.height}
              <span className="separator">/</span>페이지 {s.currentPage + 1} /{" "}
              {s.pages.length}
            </span>
            <div>
              <button
                disabled={!source || busy}
                onClick={() => source && setMagic(source)}
              >
                <ScanLine size={15} /> AI 레이어 분해{" "}
                <small>검토 후 생성</small>
              </button>
              <button
                onClick={() => file.current?.click()}
                aria-label="파일 업로드"
              >
                <Upload size={16} />
              </button>
            </div>
          </div>
          {error && (
            <div className="banner error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="오류 닫기">
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="알림 닫기">
                <X size={14} />
              </button>
            </div>
          )}
          {page.elements.some((e) => e.provenance?.backgroundWarning) && (
            <div className="banner warning">
              배경 보정 필요 · 원본에 글자/객체 잔상이 남아 있습니다. 정확한
              분리 결과가 아닙니다.
            </div>
          )}
          {(page.elements.length >= 500 ||
            page.elements.length + selected.length > 500) && (
            <div className="banner warning">
              페이지당 최대 500개 레이어입니다. 일부 요소를 다른 페이지로
              옮기거나 선택을 줄이세요.
            </div>
          )}
          <StudioCanvas />
          <div className="page-bar">
            <div className="page-tabs">
              {s.pages.map((p, i) => (
                <button
                  key={p.id}
                  className={i === s.currentPage ? "active" : ""}
                  onClick={() => s.setCurrentPage(i)}
                  aria-label={`페이지 ${i + 1}`}
                >
                  {String(i + 1).padStart(2, "0")}
                  <small>{p.elements.length}개</small>
                </button>
              ))}
              <button
                aria-label="페이지 추가"
                disabled={s.pages.length >= 30}
                onClick={() => {
                  s.addPage();
                  s.setCurrentPage(useEditorStore.getState().pages.length - 1);
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="page-actions">
              <button
                aria-label="페이지 앞으로"
                onClick={() => reorderPage(-1)}
                disabled={s.currentPage === 0}
              >
                <ArrowLeft size={15} />
              </button>
              <button
                aria-label="페이지 뒤로"
                onClick={() => reorderPage(1)}
                disabled={s.currentPage === s.pages.length - 1}
              >
                <ArrowRight size={15} />
              </button>
              <button
                aria-label="페이지 복제"
                disabled={s.pages.length >= 30}
                onClick={duplicatePage}
              >
                <Copy size={15} />
              </button>
              <button
                aria-label="페이지 삭제"
                disabled={s.pages.length <= 1}
                onClick={() => s.deletePage(s.currentPage)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <footer className="canvas-footer">
            <span>브라우저 로컬 저장 · ZIP으로 백업하세요</span>
            <div>
              <button aria-label="축소" onClick={s.zoomOut}>
                −
              </button>
              <button onClick={() => s.setZoom(1)} title="작업영역에 맞춤">
                {Math.round(s.zoom * 100)}%
              </button>
              <button aria-label="확대" onClick={s.zoomIn}>
                +
              </button>
            </div>
          </footer>
        </section>
        <aside className="inspector">
          <div className="inspector-top">
            <h2>
              <Layers size={16} />
              레이어
            </h2>
            <span>{page.elements.length}</span>
          </div>
          <div className="layers-list">
            {page.elements.length === 0 && (
              <div className="empty-layers">
                <Layers size={26} />
                <p>아직 비어 있습니다</p>
                <small>왼쪽에서 요소를 추가하세요.</small>
              </div>
            )}
            {[...page.elements].reverse().map((e, i) => (
              <div
                key={e.id}
                className={`layer-row ${s.selectedIds.includes(e.id) ? "selected" : ""}`}
                data-testid={`layer-${e.type}`}
              >
                <button
                  className="layer-name"
                  onClick={(event) =>
                    event.shiftKey
                      ? s.selectToggle(e.id)
                      : s.setSelection([e.id])
                  }
                >
                  <span className="layer-type">
                    {e.type === "text"
                      ? "T"
                      : e.type === "image"
                        ? "▧"
                        : e.type === "ellipse"
                          ? "○"
                          : "□"}
                  </span>
                  <span>
                    {e.name ??
                      (e.type === "text"
                        ? e.text.slice(0, 18)
                        : e.type === "image"
                          ? "이미지"
                          : e.type === "line"
                            ? "선"
                            : "도형")}
                    <small>
                      {e.provenance?.method.includes("approximate")
                        ? "근사 크롭"
                        : e.provenance?.backgroundWarning
                          ? "배경 보정 필요"
                          : e.provenance?.review
                            ? "확인 필요"
                            : `${String(page.elements.length - i).padStart(2, "0")}`}
                    </small>
                  </span>
                </button>
                <button
                  aria-label={`${e.id} ${e.visible ? "숨김" : "표시"}`}
                  title="표시/숨김"
                  onClick={() => s.setVisible([e.id], !e.visible)}
                >
                  {e.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  aria-label={`${e.id} ${e.locked ? "잠금 해제" : "잠금"}`}
                  title="잠금/해제"
                  onClick={() => s.setLock([e.id], !e.locked)}
                >
                  {e.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
            ))}
          </div>
          <div className="properties">
            <div className="section-label">
              {selected.length > 1
                ? `${selected.length}개 선택`
                : "선택한 요소"}
            </div>
            {el ? (
              <>
                <label>
                  레이어 이름
                  <input
                    aria-label="레이어 이름"
                    value={el.name ?? ""}
                    onChange={(e) => patch({ name: e.target.value })}
                    disabled={el.locked}
                  />
                </label>
                <fieldset disabled={el.locked}>
                  <div className="field-grid">
                    {[
                      ["x", "X"],
                      ["y", "Y"],
                      ["width", "너비"],
                      ["height", "높이"],
                    ].map(([k, label]) => (
                      <label key={k}>
                        {label}
                        <input
                          aria-label={`요소 ${label}`}
                          type="number"
                          value={Math.round(el[k as "x"])}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (k === "width" || k === "height") {
                              const dim = Math.max(4, Math.min(10000, value));
                              if (el.type === "image") {
                                const ratio = el.width / el.height;
                                patch(
                                  k === "width"
                                    ? { width: dim, height: dim / ratio }
                                    : { height: dim, width: dim * ratio },
                                );
                              } else patch({ [k]: dim });
                            } else
                              patch({
                                [k]: Math.max(-20000, Math.min(20000, value)),
                              });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="field-grid">
                    <label>
                      회전
                      <input
                        aria-label="요소 회전"
                        type="number"
                        value={Math.round(el.rotation)}
                        onChange={(e) =>
                          patch({ rotation: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      투명도
                      <input
                        aria-label="요소 투명도"
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(el.opacity * 100)}
                        onChange={(e) =>
                          patch({
                            opacity:
                              Math.min(
                                100,
                                Math.max(0, Number(e.target.value)),
                              ) / 100,
                          })
                        }
                      />
                    </label>
                  </div>
                  {el.type === "text" && (
                    <>
                      <label>
                        텍스트 내용
                        <textarea
                          id="text-editor"
                          aria-label="텍스트 내용"
                          value={el.text}
                          onChange={(e) => patch({ text: e.target.value })}
                        />
                      </label>
                      <label>
                        글꼴
                        <select
                          aria-label="글꼴"
                          value={el.fontFamily}
                          onChange={(e) =>
                            patch({ fontFamily: e.target.value })
                          }
                        >
                          <option>Noto Sans KR</option>
                          <option>sans-serif</option>
                          <option>serif</option>
                          <option>monospace</option>
                        </select>
                      </label>
                      <div className="field-grid">
                        <label>
                          크기
                          <input
                            aria-label="글자 크기"
                            type="number"
                            min="1"
                            max="1000"
                            value={el.fontSize}
                            onChange={(e) =>
                              patch({
                                fontSize: Math.min(
                                  1000,
                                  Math.max(1, Number(e.target.value)),
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          색
                          <input
                            aria-label="글자 색"
                            type="color"
                            value={el.fill}
                            onChange={(e) => patch({ fill: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          aria-pressed={el.bold}
                          onClick={() => patch({ bold: !el.bold })}
                        >
                          <b>B</b>
                        </button>
                        <button
                          aria-pressed={el.italic}
                          onClick={() => patch({ italic: !el.italic })}
                        >
                          <i>I</i>
                        </button>
                        {(["left", "center", "right"] as const).map(
                          (align, i) => {
                            const Icon = [AlignLeft, AlignCenter, AlignRight][
                              i
                            ];
                            return (
                              <button
                                key={align}
                                aria-label={`텍스트 정렬 ${align}`}
                                aria-pressed={el.align === align}
                                onClick={() => patch({ align })}
                              >
                                <Icon size={16} />
                              </button>
                            );
                          },
                        )}
                      </div>
                    </>
                  )}
                  {(el.type === "rect" || el.type === "ellipse") && (
                    <>
                      <label>
                        도형 색
                        <input
                          aria-label="도형 색"
                          type="color"
                          value={el.fill}
                          onChange={(e) => patch({ fill: e.target.value })}
                        />
                      </label>
                      {el.type === "rect" && (
                        <label>
                          모서리 반경
                          <input
                            type="number"
                            min="0"
                            max="5000"
                            value={el.cornerRadius}
                            onChange={(e) =>
                              patch({ cornerRadius: Number(e.target.value) })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {el.type === "line" && (
                    <>
                      <label>
                        선 색
                        <input
                          type="color"
                          value={el.stroke}
                          onChange={(e) => patch({ stroke: e.target.value })}
                        />
                      </label>
                      <label>
                        선 두께
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={el.strokeWidth}
                          onChange={(e) =>
                            patch({ strokeWidth: Number(e.target.value) })
                          }
                        />
                      </label>
                    </>
                  )}
                </fieldset>
                {el.locked && (
                  <p className="warning">
                    잠긴 레이어입니다. 자물쇠를 눌러 해제하세요.
                  </p>
                )}
                <div className="button-row">
                  <button
                    aria-label="레이어 위로"
                    onClick={() => s.moveLayer(el.id, "up")}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    aria-label="레이어 아래로"
                    onClick={() => s.moveLayer(el.id, "down")}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    aria-label="요소 복제"
                    disabled={el.locked}
                    onClick={s.duplicateSelection}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    aria-label="요소 삭제"
                    disabled={el.locked}
                    onClick={s.deleteSelection}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="button-row">
                  {(
                    ["left", "cx", "right", "top", "cy", "bottom"] as const
                  ).map((mode, i) => (
                    <button
                      key={mode}
                      title="선택 요소 정렬"
                      aria-label={`요소 정렬 ${mode}`}
                      onClick={() =>
                        s.alignElements(
                          selected.filter((e) => !e.locked).map((e) => e.id),
                          mode,
                        )
                      }
                    >
                      {["좌", "가로", "우", "상", "세로", "하"][i]}
                    </button>
                  ))}
                </div>
                {el.provenance && (
                  <p className="muted provenance">
                    출처: {el.provenance.source}
                    <br />
                    {el.provenance.method}
                    <br />
                    {el.provenance.review
                      ? "확인 필요 · 보정 가능"
                      : "사용자 지정"}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                캔버스나 레이어 목록에서 요소를 선택하면 속성을 편집할 수
                있습니다.
              </p>
            )}
          </div>
        </aside>
      </div>
      <input
        ref={file}
        data-testid="file-upload"
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={archive}
        data-testid="archive-upload"
        type="file"
        hidden
        accept=".zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importArchive(f);
          e.target.value = "";
        }}
      />
      {magic && (
        <MagicDialog
          source={magic}
          width={s.width}
          height={s.height}
          onClose={() => setMagic(null)}
          onApply={(newPage, assets, original) => {
            if (useEditorStore.getState().pages.length >= 30)
              throw new Error(
                "최대 30페이지입니다. 새 프로젝트에서 레이어를 생성하세요.",
              );
            assets.forEach(addAsset);
            addAsset(original);
            if (meta.current) meta.current.sources[newPage.id] = original.id;
            s.appendPage(newPage);
            setNotice(
              "새 페이지에 편집 레이어를 추가했습니다. 원본과 비교해 확인하세요.",
            );
          }}
        />
      )}
      {library && (
        <div className="modal-backdrop">
          <section
            className="library-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="프로젝트 목록"
          >
            <header className="dialog-header">
              <div>
                <span className="eyebrow">LOCAL PROJECTS</span>
                <h2>내 디자인</h2>
              </div>
              <button
                aria-label="프로젝트 목록 닫기"
                onClick={() => setLibrary(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="library-grid">
              <button className="new-project" onClick={() => void create()}>
                <Plus size={28} />
                <strong>새 디자인</strong>
                <small>
                  {size.width} × {size.height}
                </small>
              </button>
              {library.map((p) => (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() => open(p)}
                >
                  <Layers size={30} />
                  <strong>{p.name}</strong>
                  <small>
                    {p.pages.length}페이지 ·{" "}
                    {new Date(p.updatedAt).toLocaleString("ko-KR")}
                  </small>
                  <span>
                    {p.width} × {p.height}
                  </span>
                </button>
              ))}
            </div>
            <footer className="dialog-footer">
              <p>
                브라우저 데이터를 지우면 프로젝트가 삭제됩니다. ZIP 백업을
                보관하세요.
              </p>
              <button onClick={() => archive.current?.click()}>
                프로젝트 ZIP 가져오기
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
