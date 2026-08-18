import type { Metadata } from "next";
import { ChatExperience } from "@/components/chat/ChatExperience";

export const metadata: Metadata = {
  title: "Ngobrol dengan REIA",
  description: "Ngobrol dengan REIA dalam Bahasa Indonesia melalui teks atau suara.",
};

export default function ReiaPage() {
  return <ChatExperience />;
}
