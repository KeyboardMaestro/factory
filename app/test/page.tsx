import { TestFlow } from "@/components/test-flow";

export const dynamic = "force-dynamic";

export default async function TestPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const startMode = mode === "edit" || mode === "new" ? mode : "default";
  return <TestFlow startMode={startMode} />;
}
