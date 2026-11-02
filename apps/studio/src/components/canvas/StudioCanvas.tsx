"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Stage, Layer, Rect, Transformer } from "react-konva";
import { useEditorStore } from "@/store/editor-store";
import { gradientProps } from "@/lib/editor-utils";
import { ElementNode } from "./element-node";
export default function StudioCanvas() {
  const s = useEditorStore();
  const page = s.pages[s.currentPage];
  const tr = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Node>());
  const outer = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 450 });
  const register = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);
  useEffect(() => {
    tr.current?.nodes(
      s.selectedIds.flatMap((id) => {
        const node = nodes.current.get(id);
        const el = page.elements.find((e) => e.id === id);
        return node && el && !el.locked && el.visible ? [node] : [];
      }),
    );
    tr.current?.getLayer()?.batchDraw();
  }, [s.selectedIds, page]);
  useEffect(() => {
    if (!outer.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    obs.observe(outer.current);
    return () => obs.disconnect();
  }, []);
  const fit = Math.min(
    (viewport.width - 64) / s.width,
    (viewport.height - 64) / s.height,
    1,
  );
  const scale = Math.max(0.05, fit) * s.zoom;
  return (
    <div className="canvas-viewport" ref={outer} data-testid="canvas-viewport">
      <div
        className="canvas-mat"
        style={{
          minWidth: Math.max(viewport.width, s.width * scale + 64),
          minHeight: Math.max(viewport.height, s.height * scale + 64),
        }}
      >
        <div
          className="artboard"
          style={{ width: s.width * scale, height: s.height * scale }}
          data-testid="artboard"
        >
          <Stage
            width={s.width * scale}
            height={s.height * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={(e) => {
              if (
                e.target === e.target.getStage() ||
                e.target.name() === "page-background"
              )
                s.clearSelection();
            }}
          >
            <Layer>
              <Rect
                name="page-background"
                width={s.width}
                height={s.height}
                {...(page.background.type === "solid"
                  ? { fill: page.background.color }
                  : gradientProps(
                      page.background.from,
                      page.background.to,
                      page.background.angle,
                      s.width,
                      s.height,
                    ))}
              />
              {page.elements.map((el) => (
                <ElementNode
                  key={el.id}
                  element={el}
                  interactive
                  registerNode={register}
                  onDoubleClick={(id) => {
                    s.setSelection([id]);
                    document.getElementById("text-editor")?.focus();
                  }}
                />
              ))}
              <Transformer
                ref={tr}
                rotateEnabled
                keepRatio={s.selectedIds.some((id) =>
                  page.elements.some((e) => e.id === id && e.type === "image"),
                )}
                flipEnabled={false}
                boundBoxFunc={(old, next) =>
                  Math.abs(next.width) < 4 || Math.abs(next.height) < 4
                    ? old
                    : next
                }
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
