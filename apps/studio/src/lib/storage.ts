import type { Project } from "./project";
import { validateProject } from "./project";
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    let blocked=false;
    const req = indexedDB.open("personal-magic-studio", 2);
    req.onupgradeneeded = () => {
      if(!req.result.objectStoreNames.contains('projects'))req.result.createObjectStore("projects", { keyPath: "id" });
      if(!req.result.objectStoreNames.contains('checkpoints'))req.result.createObjectStore('checkpoints',{keyPath:'id'});
    };
    req.onblocked=()=>{blocked=true;dbPromise=undefined;reject(new Error('저장소 업데이트 대기: 다른 Studio 탭을 닫고 다시 열어 주세요.'));};
    req.onsuccess = () => {if(blocked){req.result.close();return;}req.result.onversionchange=()=>{req.result.close();dbPromise=undefined;};resolve(req.result);};
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
    const tx = db.transaction(["projects","checkpoints"], "readwrite");
    let failure:unknown;
    const store=tx.objectStore('projects'),read=store.get(p.id);
    read.onsuccess=()=>{
      try {
        if(read.result){
          // Never replace a corrupt record or a good checkpoint with bad data.
          const previous=validateProject(read.result);
          if(JSON.stringify({...previous,updatedAt:''})!==JSON.stringify({...p,updatedAt:''}))tx.objectStore('checkpoints').put(previous);
        }
        store.put(p);
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error("저장 실패: 저장 공간을 확인하고 ZIP 백업을 내려받으세요."),
      );
    tx.onabort = () =>
      reject(failure??new Error("저장이 중단되었습니다. ZIP 백업을 내려받으세요."));
  });
}
/** Reads validated prior saves; restoration always uses a new project ID in UI. */
export async function listRecoveryProjects():Promise<Project[]> {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('checkpoints').objectStore('checkpoints').getAll();
    request.onsuccess=()=>{const valid:Project[]=[];for(const raw of request.result){try{valid.push(validateProject(raw));}catch{/* Preserve invalid recovery records in storage. */}}resolve(valid.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));};
    request.onerror=()=>reject(new Error('복구본을 읽을 수 없습니다. 기존 기록은 유지됩니다.'));
  });
}
export async function listProjects(onDamaged?: (records: unknown[]) => void): Promise<Project[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction("projects").objectStore("projects").getAll();
    req.onsuccess = () => {
      try {
        const valid:Project[]=[],damaged:unknown[]=[];
        for(const raw of req.result) {
          try { valid.push(validateProject(raw)); }
          catch { damaged.push(raw); }
        }
        if(damaged.length && !onDamaged) throw new Error("Damaged records require explicit handling");
        onDamaged?.(damaged);
        resolve(valid.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
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
