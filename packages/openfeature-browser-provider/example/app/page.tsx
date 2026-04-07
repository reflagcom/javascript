import { Context } from "@/components/Context";
import { HuddleFeature } from "@/components/HuddleFeature";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <Context />
      <HuddleFeature />
    </main>
  );
}
