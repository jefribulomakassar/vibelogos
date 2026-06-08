'use client';
import dynamic from "next/dynamic";

const TestingClient = dynamic(() => import("./TestingClient"), { ssr: false });

export default function DynamicLoader() {
  return <TestingClient />;
}
