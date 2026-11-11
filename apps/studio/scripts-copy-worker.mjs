import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/pdf.worker.min.mjs",
);
mkdirSync('public/sam/ort', { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'])
  copyFileSync(`node_modules/onnxruntime-web/dist/${name}`, `public/sam/ort/${name}`);
copyFileSync('node_modules/onnxruntime-web/README.md', 'public/sam/ort/README-onnxruntime.txt');
