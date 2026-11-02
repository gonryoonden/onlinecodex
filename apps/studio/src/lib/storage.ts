import type { Project } from "./project";
import { validateProject } from "./project";
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("personal-magic-studio", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("projects", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = undefined;
      reject(
        new Error("브라우저 저장소를 열 수 없습니다. ZIP 백업을 저장하세요."),
      );
    };
  }));
}
export async function saveProject(project: Project) {
  const p = validateProject(project);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error("저장 실패: 저장 공간을 확인하고 ZIP 백업을 내려받으세요."),
      );
    tx.onabort = () =>
      reject(new Error("저장이 중단되었습니다. ZIP 백업을 내려받으세요."));
  });
}
export async function listProjects(): Promise<Project[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction("projects").objectStore("projects").getAll();
    req.onsuccess = () => {
      try {
        resolve(
          req.result
            .map(validateProject)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      } catch {
        reject(
          new Error(
            "저장 데이터 오류. 기존 데이터를 지우지 않고 열기를 중단했습니다.",
          ),
        );
      }
    };
    req.onerror = () => reject(req.error);
  });
}
