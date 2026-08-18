import type { Metadata } from "next";
import { GestureExperience } from "@/components/gesture/GestureExperience";

export const metadata: Metadata = {
  title: "Gesture Music",
  description: "Ubah gerakan tangan menjadi nada, pitch, ritme, dan harmoni langsung dari kamera browser.",
};

export default function GesturePage() {
  return <GestureExperience />;
}
