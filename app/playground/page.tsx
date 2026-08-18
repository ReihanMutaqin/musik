import type { Metadata } from "next";
import { PlaygroundExperience } from "@/components/playground/PlaygroundExperience";

export const metadata: Metadata = {
  title: "Playground",
  description: "Eksperimen interaktif REIA untuk suara, ekspresi, visual gerak, dan digital theremin.",
};

export default function PlaygroundPage() {
  return <PlaygroundExperience />;
}
