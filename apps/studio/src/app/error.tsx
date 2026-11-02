"use client";
export default function EditorError({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <div>
        <h1>편집 화면을 다시 열어야 합니다.</h1>
        <p>마지막으로 저장된 프로젝트는 이 브라우저에 남아 있습니다.</p>
        <button onClick={reset}>편집기 다시 열기</button>
      </div>
    </main>
  );
}
