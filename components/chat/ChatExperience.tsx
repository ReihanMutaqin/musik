"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAppSettings } from "@/components/AppProviders";
import { Robot, type RobotState } from "@/components/robot/Robot";
import { ChatIcon, HandIcon, MicIcon, SendIcon, SoundIcon, StopIcon, TrashIcon } from "@/components/ui/Icons";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type SpeechRecognitionErrorLike = { error: string };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => RecognitionLike;

const initialMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hai, aku REIA. Mau ngobrol, tanya sesuatu, atau main musik?",
};

const suggestions = ["Lagi ngapain?", "Jelasin AI dengan sederhana", "Kasih ide proyek kreatif", "Ajarin aku nada dasar"];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatExperience() {
  const { settings } = useAppSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [status, setStatus] = useState("Siap diajak ngobrol");
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("reihan.chat");
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; messages?: ChatMessage[] };
          if (parsed.version === 1 && Array.isArray(parsed.messages) && parsed.messages.length) {
            setMessages(parsed.messages.slice(-40));
          }
        }
      } catch {
        localStorage.removeItem("reihan.chat");
      }
      const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
      setRecognitionSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
      setVoiceSupported("speechSynthesis" in window);
      setChatHydrated(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (chatHydrated && messages.length) localStorage.setItem("reihan.chat", JSON.stringify({ version: 1, messages: messages.slice(-40) }));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHydrated, messages]);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`_]/g, ""));
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === "id-id" && /female|gadis|wanita|google/i.test(voice.name))
      || voices.find((voice) => voice.lang.toLowerCase().startsWith("id"))
      || voices.find((voice) => voice.lang.toLowerCase().startsWith("ms"))
      || null;
    utterance.lang = utterance.voice?.lang || "id-ID";
    utterance.rate = settings.voiceRate;
    utterance.pitch = settings.voicePitch;
    utterance.volume = settings.masterVolume;
    utterance.onstart = () => { setRobotState("speaking"); setStatus("Berbicara..."); };
    utterance.onend = () => { setRobotState("idle"); setStatus("Siap diajak ngobrol"); };
    utterance.onerror = () => { setRobotState("idle"); setStatus("Siap diajak ngobrol"); };
    window.speechSynthesis.speak(utterance);
  }, [settings.masterVolume, settings.voicePitch, settings.voiceRate]);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    setStreaming(false);
    setListening(false);
    setRobotState("idle");
    setStatus("Dihentikan");
  }, []);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    window.speechSynthesis?.cancel();
    const userMessage: ChatMessage = { id: newId(), role: "user", content: text };
    const uiMessages = [...messages, userMessage].slice(-39);
    const history = uiMessages.slice(-16);
    const assistantId = newId();
    setMessages([...uiMessages, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setRobotState("thinking");
    setStatus("Berpikir...");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Robotnya lagi susah nyambung. Coba sekali lagi ya.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let firstToken = true;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        fullText += chunk;
        if (firstToken) {
          firstToken = false;
          setRobotState("speaking");
          setStatus("Menjawab...");
        }
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: fullText } : message));
      }
      if (!fullText.trim()) throw new Error("REIA belum mendapat jawaban. Coba kirim lagi ya.");
      setRobotState("happy");
      setStatus("Selesai menjawab");
      window.setTimeout(() => setRobotState("idle"), 1100);
      if (settings.autoSpeak) speak(fullText);
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) => current.filter((message) => message.id !== assistantId || message.content));
      } else {
        const message = error instanceof Error ? error.message : "Robotnya lagi susah nyambung. Coba sekali lagi ya.";
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: message, error: true } : item));
        setRobotState("error");
        setStatus("Belum bisa terhubung");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, settings.autoSpeak, speak, streaming]);

  const startListening = () => {
    if (!recognitionSupported || streaming) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      let final = false;
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        final ||= event.results[index].isFinal;
      }
      setInput(transcript);
      setStatus(final ? "Memahami..." : "Mendengarkan...");
    };
    recognition.onerror = (event) => {
      setListening(false);
      setRobotState("error");
      setStatus(event.error === "not-allowed" ? "Mikrofon belum diizinkan" : "Suaramu belum terdengar jelas");
    };
    recognition.onend = () => {
      setListening(false);
      setRobotState("idle");
      setStatus((current) => current === "Mendengarkan..." ? "Siap dikirim" : current);
      inputRef.current?.focus();
    };
    recognitionRef.current = recognition;
    setListening(true);
    setRobotState("listening");
    setStatus("Mendengarkan...");
    recognition.start();
  };

  const clearChat = () => {
    stopAll();
    setMessages([initialMessage]);
    localStorage.removeItem("reihan.chat");
    setInput("");
    setStatus("Obrolan baru dimulai");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const lastAnswer = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant" && message.content && !message.error)?.content, [messages]);

  return (
    <main className="chat-page section-shell">
      <aside className="chat-stage">
        <div className="chat-stage__eyebrow"><span className={`status-dot ${robotState === "error" ? "status-dot--error" : ""}`} /> {status}</div>
        <div className="chat-stage__robot"><Robot state={robotState} /></div>
        <div className="chat-stage__copy">
          <p className="kicker">NGOBROL DENGAN REIA</p>
          <h1>Aku dengerin.</h1>
          <p>Tanya apa saja, cerita soal harimu, atau cari ide bareng. Aku akan menjawab dengan gaya yang natural.</p>
        </div>
        <Link className="chat-stage__music" href="/gesture"><HandIcon /><span><strong>Mau coba yang lain?</strong><small>Ubah tanganmu jadi alat musik</small></span></Link>
      </aside>

      <section className="chat-panel" aria-label="Percakapan dengan REIA">
        <div className="chat-panel__header">
          <div><span className="brand__mark"><i /><i /></span><p><strong>REIA</strong><small>Teman digitalmu</small></p></div>
          <div>
            {voiceSupported && lastAnswer && <button className="icon-button" type="button" onClick={() => speak(lastAnswer)} aria-label="Bacakan jawaban terakhir"><SoundIcon /></button>}
            <button className="icon-button" type="button" onClick={clearChat} aria-label="Mulai obrolan baru"><TrashIcon /></button>
          </div>
        </div>

        <div className="chat-messages" ref={scrollRef} aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`message message--${message.role} ${message.error ? "message--error" : ""}`}>
              {message.role === "assistant" && <span className="message__avatar"><i /><i /></span>}
              <div>{message.content || <span className="typing-dots"><i /><i /><i /></span>}</div>
            </div>
          ))}
          {messages.length <= 1 && (
            <div className="chat-suggestions">
              <span>Coba tanyakan</span>
              <div>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>
            </div>
          )}
        </div>

        <form className="chat-composer" onSubmit={submit}>
          <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value.slice(0, 4000))} onKeyDown={handleKeyDown} placeholder={listening ? "Aku lagi mendengarkan..." : "Tulis pesan untuk REIA..."} rows={1} aria-label="Pesan untuk REIA" disabled={streaming} />
          <div className="chat-composer__actions">
            {streaming ? (
              <button className="composer-button composer-button--stop" type="button" onClick={stopAll} aria-label="Hentikan jawaban"><StopIcon /></button>
            ) : (
              <>
                <button className={`composer-button ${listening ? "is-listening" : ""}`} type="button" onClick={startListening} aria-label={listening ? "Hentikan mendengarkan" : "Aktifkan mikrofon"} disabled={!recognitionSupported} title={!recognitionSupported ? "Pengenalan suara tidak didukung browser ini" : undefined}><MicIcon /></button>
                <button className="composer-button composer-button--send" type="submit" aria-label="Kirim pesan" disabled={!input.trim()}><SendIcon /></button>
              </>
            )}
          </div>
          <small>{input.length}/4000 · Enter untuk kirim, Shift + Enter untuk baris baru</small>
        </form>
        {!recognitionSupported && <p className="chat-fallback"><ChatIcon /> Pengenalan suara tidak tersedia di browser ini. Chat teks tetap bisa digunakan.</p>}
      </section>
    </main>
  );
}
