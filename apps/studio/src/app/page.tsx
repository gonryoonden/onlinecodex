"use client";
import dynamic from "next/dynamic";
const Studio = dynamic(() => import("@/components/Studio"), {
  ssr: false,
  loading: () => (
    <div className="loading">
      Personal Magic Studio · 편집기를 열고 있습니다…
    </div>
  ),
});
export default function Home() {
  return <Studio />;
}
