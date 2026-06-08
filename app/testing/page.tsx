// app/testing/page.tsx
import dynamic from "next/dynamic";

const TestingPage = dynamic(() => import("./TestingClient"), { ssr: false });

export default function Page() {
  return <TestingPage />;
}
