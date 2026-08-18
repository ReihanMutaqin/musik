import type { Metadata } from "next";
import { SettingsExperience } from "@/components/settings/SettingsExperience";

export const metadata: Metadata = { title: "Pengaturan", description: "Atur tema, suara, kamera, musik, dan gerakan REIA." };

export default function SettingsPage() { return <SettingsExperience />; }
