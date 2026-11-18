"use client";

import { DeepgramClient } from "@deepgram/sdk";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";

type CaptureStage = "idle" | "listening" | "structuring" | "review" | "saved";
type QuickPanel = "prescription" | "exam" | null;

type SpeakerRole = "medico" | "paciente";
type SpeakerSegment = { id: string; speaker: SpeakerRole; text: string };
type SuggestedExam = { nome: string; justificativa: string };
type SuggestedMedication = { nome: string; dose: string | null; via: string | null; frequencia: string | null; duracao: string | null; instrucoes: string | null };
type ApprovalStatus = "pending" | "approved" | "rejected";
type StructuredRecord = {
  queixa_principal: string;
  hda: string;
  exame_fisico: string;
  cid10_sugerido: string;
  diagnostico_sugerido: string;
  conduta: string;
  exames_sugeridos: SuggestedExam[];
  medicamentos_sugeridos: SuggestedMedication[];
};
type DirectDeepgramConnection = {
  on: (event: "message" | "error" | "close", callback: (message: unknown) => void) => void;
  connect: () => unknown;
  waitForOpen: () => Promise<unknown>;
  sendMedia: (message: Blob | ArrayBuffer | ArrayBufferView) => void;
  sendCloseStream: (message: { type: "CloseStream" }) => void;
  close: () => void;
};
type DeepgramWord = { word?: string; punctuated_word?: string; speaker?: number };
type DirectDeepgramMessage = {
  type?: string;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string; words?: DeepgramWord[] }> };
};

const EMPTY_RECORD: StructuredRecord = {
  queixa_principal: "",
  hda: "",
  exame_fisico: "",
  cid10_sugerido: "",
  diagnostico_sugerido: "",
  conduta: "",
  exames_sugeridos: [],
  medicamentos_sugeridos: [],
};

const FINAL_RECORD: StructuredRecord = {
  queixa_principal: "Cefaleia leve desde ontem e pressão arterial elevada.",
  hda: "Nega náusea, vômitos e alterações visuais. Refere uso regular de losartana 50 mg pela manhã.",
  exame_fisico: "BEG, orientada, hidratada, sem déficit neurológico. PA 148/92 mmHg.",
  cid10_sugerido: "I10",
  diagnostico_sugerido: "Hipertensão arterial sistêmica",
  conduta: "Reforçar medidas não farmacológicas. Solicitar creatinina e potássio. Retorno em 30 dias.",
  exames_sugeridos: [
    { nome: "Creatinina sérica", justificativa: "Monitorar função renal no acompanhamento da hipertensão." },
    { nome: "Potássio sérico", justificativa: "Monitorar eletrólitos durante uso de losartana." },
  ],
  medicamentos_sugeridos: [
    { nome: "Losartana", dose: "50 mg", via: "Oral", frequencia: "1 vez ao dia, pela manhã", duracao: "Uso contínuo", instrucoes: "Manter uso regular." },
  ],
};

const SAMPLE_SEGMENTS: Array<Omit<SpeakerSegment, "id"> & { structure: Partial<StructuredRecord> }> = [
  { speaker: "medico", text: "Bom dia, dona Maria. O que está sentindo hoje?", structure: {} },
  { speaker: "paciente", text: "Desde ontem estou com uma dor de cabeça leve e fiquei preocupada com a pressão.", structure: { queixa_principal: "Cefaleia leve desde ontem e preocupação com pressão arterial." } },
  { speaker: "medico", text: "Teve enjoo, vômito, visão embaçada ou alguma fraqueza?", structure: {} },
  { speaker: "paciente", text: "Não, nada disso. Estou tomando a losartana de cinquenta toda manhã, sem esquecer.", structure: { hda: "Nega náusea, vômitos, alteração visual e fraqueza. Uso regular de losartana 50 mg pela manhã." } },
  { speaker: "medico", text: "Sua pressão hoje está 148 por 92. No exame, está orientada, hidratada e sem déficit neurológico.", structure: { exame_fisico: "BEG, orientada, hidratada, sem déficit neurológico. PA 148/92 mmHg.", cid10_sugerido: "I10", diagnostico_sugerido: "Hipertensão arterial sistêmica" } },
  { speaker: "medico", text: "Vamos reforçar os cuidados, pedir creatinina e potássio e rever em trinta dias.", structure: { conduta: "Reforçar medidas não farmacológicas. Solicitar creatinina e potássio. Retorno em 30 dias.", exames_sugeridos: FINAL_RECORD.exames_sugeridos } },
  { speaker: "medico", text: "Vou renovar a losartana de cinquenta miligramas: um comprimido pela manhã, uso contínuo.", structure: { medicamentos_sugeridos: FINAL_RECORD.medicamentos_sugeridos } },
];

const SAMPLE_TRANSCRIPT = SAMPLE_SEGMENTS.map((segment) => `${segment.speaker === "medico" ? "Médico" : "Paciente"}: ${segment.text}`).join("\n");

function segmentsFromDeepgram(message: DirectDeepgramMessage): SpeakerSegment[] {
  const alternative = message.channel?.alternatives?.[0];
  const words = alternative?.words ?? [];
  if (!words.length) {
    const text = alternative?.transcript?.trim();
    return text ? [{ id: `${message.start ?? Date.now()}-0`, speaker: "medico", text }] : [];
  }

  const grouped: Array<{ speaker: SpeakerRole; words: string[] }> = [];
  for (const word of words) {
    const speaker: SpeakerRole = Number(word.speaker ?? 0) === 0 ? "medico" : "paciente";
    const text = word.punctuated_word ?? word.word ?? "";
    const last = grouped.at(-1);
    if (!last || last.speaker !== speaker) grouped.push({ speaker, words: [text] });
    else last.words.push(text);
  }

  return grouped.map((group, index) => ({
    id: `${message.start ?? Date.now()}-${index}-${group.speaker}`,
    speaker: group.speaker,
    text: group.words.filter(Boolean).join(" ").trim(),
  })).filter((segment) => segment.text);
}

const templates = ["Hipertensão", "Diabetes", "IVAS", "Renovar receita"];

type WorkspaceStore = {
  stage: CaptureStage;
  transcript: string;
  selectedTemplate: string;
  quickPanel: QuickPanel;
  setStage: (stage: CaptureStage) => void;
  setTranscript: (value: string | ((current: string) => string)) => void;
  setSelectedTemplate: (template: string) => void;
  setQuickPanel: (panel: QuickPanel) => void;
};

const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  stage: "idle",
  transcript: "",
  selectedTemplate: "Hipertensão",
  quickPanel: null,
  setStage: (stage) => set({ stage }),
  setTranscript: (value) => set((state) => ({
    transcript: typeof value === "function" ? value(state.transcript) : value,
  })),
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
  setQuickPanel: (quickPanel) => set({ quickPanel }),
}));

function MiniIcon({ children }: { children: React.ReactNode }) {
  return <span className="mini-icon" aria-hidden="true">{children}</span>;
}

function Login({ onEnter }: { onEnter: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEnter();
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="brand brand-on-dark">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Lumos <strong>Health</strong></span>
        </div>
        <div className="login-copy">
          <span className="eyebrow-light">PRONTUÁRIO QUE ESCUTA</span>
          <h1>Mais tempo olhando para quem importa.</h1>
          <p>Converse naturalmente. A Lumos acompanha, organiza e prepara o registro para sua aprovação.</p>
        </div>
        <div className="login-quote">
          <span className="quote-mark">“</span>
          <p>A tecnologia desaparece. O encontro permanece.</p>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <span className="mobile-brand">Lumos <strong>Health</strong></span>
          <div>
            <span className="eyebrow">PROTÓTIPO DE DEMONSTRAÇÃO</span>
            <h2>Conheça o fluxo de atendimento.</h2>
            <p>Os pacientes e profissionais exibidos são fictícios. Este acesso não realiza autenticação clínica.</p>
          </div>
          <button className="primary-button login-button" type="submit">Abrir demonstração <span>→</span></button>
          <div className="secure-note"><span>✓</span> Demonstração com dados fictícios — não utilizar informações reais</div>
        </form>
      </section>
    </main>
  );
}

export default function LumosHealthApp() {
  const [authenticated, setAuthenticated] = useState(true);
  const {
    stage,
    transcript,
    selectedTemplate,
    quickPanel,
    setStage,
    setTranscript,
    setSelectedTemplate,
    setQuickPanel,
  } = useWorkspaceStore();
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState("");
  const [timer, setTimer] = useState(0);
  const [consentConfirmed, setConsentConfirmed] = useState(true);
  const [segments, setSegments] = useState<SpeakerSegment[]>([]);
  const [interimSegment, setInterimSegment] = useState<SpeakerSegment | null>(null);
  const [structured, setStructured] = useState<StructuredRecord>(EMPTY_RECORD);
  const [voiceMode, setVoiceMode] = useState<"demo" | "connecting" | "live">("demo");
  const [examDecisions, setExamDecisions] = useState<Record<number, ApprovalStatus>>({});
  const [medicationDecisions, setMedicationDecisions] = useState<Record<number, ApprovalStatus>>({});
  const [timelineDetail, setTimelineDetail] = useState<"current" | "triage" | "followup" | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceSocket = useRef<WebSocket | null>(null);
  const directDeepgram = useRef<DirectDeepgramConnection | null>(null);
  const segmentsRef = useRef<SpeakerSegment[]>([]);
  const structuredRef = useRef<StructuredRecord>(EMPTY_RECORD);
  const demoStarted = useRef(false);
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveStructureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncSegments = useCallback((next: SpeakerSegment[]) => {
    segmentsRef.current = next;
    setSegments(next);
    setTranscript(next.map((segment) => `${segment.speaker === "medico" ? "Médico" : "Paciente"}: ${segment.text}`).join("\n"));
  }, [setTranscript]);

  const mergeStructure = useCallback((update: Partial<StructuredRecord>) => {
    const next = { ...structuredRef.current };
    const textFields: Array<Exclude<keyof StructuredRecord, "exames_sugeridos" | "medicamentos_sugeridos">> = ["queixa_principal", "hda", "exame_fisico", "cid10_sugerido", "diagnostico_sugerido", "conduta"];
    for (const key of textFields) {
      const value = update[key];
      if (typeof value === "string" && value.trim()) next[key] = value;
    }
    if (Array.isArray(update.exames_sugeridos)) next.exames_sugeridos = update.exames_sugeridos;
    if (Array.isArray(update.medicamentos_sugeridos)) next.medicamentos_sugeridos = update.medicamentos_sugeridos;
    structuredRef.current = next;
    setStructured(next);
  }, []);

  const scheduleLiveStructure = useCallback((nextSegments: SpeakerSegment[]) => {
    if (liveStructureTimer.current) clearTimeout(liveStructureTimer.current);
    const liveTranscript = nextSegments
      .map((segment) => `${segment.speaker === "medico" ? "Médico" : "Paciente"}: ${segment.text}`)
      .join("\n");
    if (liveTranscript.length < 45) return;
    liveStructureTimer.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/structure", {
          method: "POST",
          headers: { "content-type": "application/json", "x-lumos-local-demo": "local-only" },
          body: JSON.stringify({ transcript: liveTranscript, category: "medico" }),
        });
        const body = await response.json() as { data?: Partial<StructuredRecord>; mode?: string };
        if (body.data) mergeStructure(body.data);
      } catch {
        // A transcrição continua visível; uma nova fala tentará estruturar novamente.
      }
    }, 900);
  }, [mergeStructure]);

  const startDemoFlow = useCallback(() => {
    if (demoStarted.current) return;
    demoStarted.current = true;
    setVoiceMode("demo");
    let index = 0;
    transcriptTimer.current = setInterval(() => {
      const sample = SAMPLE_SEGMENTS[index];
      if (!sample) {
        if (transcriptTimer.current) clearInterval(transcriptTimer.current);
        return;
      }
      const next = [...segmentsRef.current, { id: `demo-${index}`, speaker: sample.speaker, text: sample.text }];
      syncSegments(next);
      mergeStructure(sample.structure);
      index += 1;
    }, 1150);
  }, [mergeStructure, syncSegments]);

  const stopMedia = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (voiceSocket.current?.readyState === WebSocket.OPEN) voiceSocket.current.close(1000, "client-complete");
    directDeepgram.current?.close();
    voiceSocket.current = null;
    directDeepgram.current = null;
    streamRef.current = null;
    mediaRecorder.current = null;
  }, []);

  const beginCapture = useCallback(async () => {
    if (!consentConfirmed) {
      setToast("Confirme que a paciente foi informada antes de iniciar.");
      return;
    }
    setTranscript("");
    syncSegments([]);
    structuredRef.current = EMPTY_RECORD;
    setStructured(EMPTY_RECORD);
    setExamDecisions({});
    setMedicationDecisions({});
    setInterimSegment(null);
    setTimer(0);
    setStage("listening");
    demoStarted.current = false;
    clockTimer.current = setInterval(() => setTimer((current) => current + 1), 1000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      const socketUrl = process.env.NEXT_PUBLIC_VOICE_WS_URL;

      if (!socketUrl) {
        setVoiceMode("connecting");
        const tokenResponse = await fetch("/api/deepgram/token", { method: "POST", headers: { "x-lumos-local-demo": "local-only" } });
        if (!tokenResponse.ok) throw new Error("deepgram-token-unavailable");
        const tokenBody = await tokenResponse.json() as { accessToken?: string };
        if (!tokenBody.accessToken) throw new Error("deepgram-token-missing");

        const deepgram = new DeepgramClient({ accessToken: tokenBody.accessToken });
        const connection = await deepgram.listen.v1.connect({
          model: "nova-3",
          language: "pt-BR",
          smart_format: "true",
          punctuate: "true",
          interim_results: "true",
          endpointing: "450",
          vad_events: "true",
          diarize_model: "latest",
        }) as unknown as DirectDeepgramConnection;
        directDeepgram.current = connection;
        connection.on("message", (rawMessage) => {
          const message = rawMessage as DirectDeepgramMessage;
          if (message.type !== "Results") return;
          const nextSegments = segmentsFromDeepgram(message);
          if (!nextSegments.length) return;
          if (message.is_final) {
            const next = [...segmentsRef.current, ...nextSegments];
            syncSegments(next);
            setInterimSegment(null);
            scheduleLiveStructure(next);
          } else {
            setInterimSegment(nextSegments.at(-1) ?? null);
          }
        });
        connection.on("error", () => {
          setToast("A conexão de voz foi interrompida; a transcrição já recebida foi preservada.");
          if (!segmentsRef.current.length) startDemoFlow();
        });
        connection.connect();
        await connection.waitForOpen();
        setVoiceMode("live");
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) connection.sendMedia(event.data);
        });
        recorder.start(320);
        return;
      }

      setVoiceMode("connecting");
      const socket = new WebSocket(`${socketUrl.replace(/\/$/, "")}?category=medico`);
      voiceSocket.current = socket;
      socket.addEventListener("open", () => {
        setVoiceMode("live");
        recorder.start(320);
      });
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size && socket.readyState === WebSocket.OPEN) socket.send(event.data);
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            text?: string;
            final?: boolean;
            speaker?: SpeakerRole;
            id?: string;
            data?: Partial<StructuredRecord>;
            message?: string;
          };
          if (message.type === "transcript" && message.text) {
            const segment = {
              id: message.id ?? `voice-${Date.now()}`,
              speaker: message.speaker ?? "medico",
              text: message.text,
            };
            if (message.final) {
              syncSegments([...segmentsRef.current, segment]);
              setInterimSegment(null);
            } else {
              setInterimSegment(segment);
            }
          }
          if (message.type === "structure" && message.data) mergeStructure(message.data);
          if (message.type === "error") setToast(message.message ?? "A escuta ao vivo foi interrompida.");
        } catch {
          setToast("Recebemos uma resposta de voz inválida; o áudio continua localmente.");
        }
      });
      socket.addEventListener("error", () => {
        if (recorder.state === "inactive") recorder.start(400);
        setToast("Servidor de voz indisponível — ativamos a demonstração local.");
        if (!segmentsRef.current.length) startDemoFlow();
      });
    } catch {
      if (streamRef.current) {
        if (mediaRecorder.current?.state === "inactive") mediaRecorder.current.start(400);
        setToast("Deepgram indisponível — ativamos a demonstração local sem expor sua chave.");
      } else {
        setToast("Microfone indisponível — o modo de demonstração continua ativo.");
      }
      startDemoFlow();
    }
  }, [consentConfirmed, mergeStructure, scheduleLiveStructure, setStage, setTranscript, startDemoFlow, syncSegments]);

  const finishCapture = useCallback(async () => {
    if (transcriptTimer.current) clearInterval(transcriptTimer.current);
    if (clockTimer.current) clearInterval(clockTimer.current);
    if (liveStructureTimer.current) clearTimeout(liveStructureTimer.current);
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.requestData();
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      mediaRecorder.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (voiceSocket.current?.readyState === WebSocket.OPEN) {
      voiceSocket.current.send(JSON.stringify({ type: "finalize" }));
    }
    if (directDeepgram.current) {
      directDeepgram.current.sendCloseStream({ type: "CloseStream" });
    }
    setStage("structuring");
    if (voiceMode === "live") {
      await new Promise((resolve) => window.setTimeout(resolve, 420));
    }
    const rawTranscript = segmentsRef.current.length
      ? segmentsRef.current.map((segment) => `${segment.speaker === "medico" ? "Médico" : "Paciente"}: ${segment.text}`).join("\n")
      : SAMPLE_TRANSCRIPT;
    if (!segmentsRef.current.length) {
      syncSegments(SAMPLE_SEGMENTS.map((segment, index) => ({ id: `fallback-${index}`, speaker: segment.speaker, text: segment.text })));
    }

    if (!Object.values(structuredRef.current).some(Boolean) || voiceMode === "live") {
      try {
        const response = await fetch("/api/structure", {
          method: "POST",
          headers: { "content-type": "application/json", "x-lumos-local-demo": "local-only" },
          body: JSON.stringify({ transcript: rawTranscript, category: "medico" }),
        });
        const body = await response.json() as { data?: Partial<StructuredRecord>; mode?: string };
        if (body.data) mergeStructure(body.data);
        if (body.mode === "unavailable" && voiceMode === "live") {
          setToast("Transcrição concluída. A OpenAI está sem quota; preencha ou revise os campos manualmente.");
        }
      } catch {
        if (voiceMode === "demo") mergeStructure(FINAL_RECORD);
        else setToast("A estruturação da IA está indisponível. Revise a transcrição e preencha os campos manualmente.");
      }
    } else {
      mergeStructure(FINAL_RECORD);
    }

    window.setTimeout(() => {
      if (voiceSocket.current?.readyState === WebSocket.OPEN) voiceSocket.current.close(1000, "review-ready");
      directDeepgram.current?.close();
      voiceSocket.current = null;
      directDeepgram.current = null;
      setStage("review");
    }, 650);
  }, [mergeStructure, setStage, syncSegments, voiceMode]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      if (transcriptTimer.current) clearInterval(transcriptTimer.current);
      if (clockTimer.current) clearInterval(clockTimer.current);
      if (liveStructureTimer.current) clearTimeout(liveStructureTimer.current);
      stopMedia();
    };
  }, [stopMedia]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        if (stage === "listening") finishCapture();
        else if (!typing && stage !== "structuring") beginCapture();
      }
      if (!typing && event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setQuickPanel("prescription");
      }
      if (!typing && event.altKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setQuickPanel("exam");
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [beginCapture, finishCapture, setQuickPanel, stage]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function applyTemplate(template: string) {
    setSelectedTemplate(template);
    if (template === "Renovar receita") {
      setQuickPanel("prescription");
      return;
    }
    setToast(`Template de ${template} preparado.`);
  }

  const pendingApprovalCount = structured.exames_sugeridos.filter((_, index) => (examDecisions[index] ?? "pending") === "pending").length
    + structured.medicamentos_sugeridos.filter((_, index) => (medicationDecisions[index] ?? "pending") === "pending").length;
  const approvedExams = structured.exames_sugeridos.filter((_, index) => examDecisions[index] === "approved");
  const approvedMedications = structured.medicamentos_sugeridos.filter((_, index) => medicationDecisions[index] === "approved");

  function updateStructured(field: Exclude<keyof StructuredRecord, "exames_sugeridos" | "medicamentos_sugeridos">, value: string) {
    const next = { ...structuredRef.current, [field]: value };
    structuredRef.current = next;
    setStructured(next);
  }

  function updateExam(index: number, field: keyof SuggestedExam, value: string) {
    const exams = structured.exames_sugeridos.map((exam, itemIndex) => itemIndex === index ? { ...exam, [field]: value } : exam);
    const next = { ...structuredRef.current, exames_sugeridos: exams };
    structuredRef.current = next;
    setStructured(next);
  }

  function updateMedication(index: number, field: keyof SuggestedMedication, value: string) {
    const medications = structured.medicamentos_sugeridos.map((medication, itemIndex) => itemIndex === index ? { ...medication, [field]: value || null } : medication);
    const next = { ...structuredRef.current, medicamentos_sugeridos: medications };
    structuredRef.current = next;
    setStructured(next);
  }

  async function confirmRecord() {
    if (pendingApprovalCount > 0) {
      setToast(`Revise ${pendingApprovalCount} ${pendingApprovalCount === 1 ? "sugestão pendente" : "sugestões pendentes"} antes de confirmar.`);
      return;
    }

    // Demo preview, not a clinically signed record. Never persist transcripts
    // or generated clinical data in browser localStorage.
    setStage("saved");
    if (!online) {
      setToast("Prévia concluída offline. Nenhuma informação clínica foi armazenada.");
      return;
    }

    const draft = {
      transcript: transcript || SAMPLE_TRANSCRIPT,
      category: "consulta_medica",
      structuredData: {
        ...structured,
        exames_sugeridos: approvedExams,
        medicamentos_sugeridos: approvedMedications,
      },
    };

    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "content-type": "application/json", "x-lumos-local-demo": "local-only" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        setToast("Prévia concluída. API local desativada; nenhum registro foi enviado.");
        return;
      }
      setToast("Rascunho fictício salvo na demonstração local. Não assinado.");
    } catch {
      setToast("Prévia concluída. Nenhum registro clínico foi enviado.");
    }
  }

  if (!authenticated) return <Login onEnter={() => setAuthenticated(true)} />;

  return (
    <main className="app-shell">
      <div className="lumos-demo-banner" role="status">DEMONSTRAÇÃO EXPERIMENTAL — DADOS FICTÍCIOS • Sem autenticação clínica nem assinatura válida</div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Lumos <strong>Health</strong></span>
        </div>
        <div className="unit-name"><span className="unit-dot">+</span> UBS Jardim Esperança <span className="chevron">⌄</span></div>
        <div className="topbar-actions">
          <div className={`sync-status ${online ? "" : "offline"}`}><span /> {online ? "Sincronizado agora" : "Trabalhando offline"}</div>
          <button className="icon-button" aria-label="Ajuda">?</button>
          <button className="professional" onClick={() => setAuthenticated(false)} aria-label="Trocar profissional">
            <span className="avatar">AL</span>
            <span><strong>Dra. Ana Lima</strong><small>Clínica geral • CRM 48291</small></span>
            <span className="chevron">⌄</span>
          </button>
        </div>
      </header>

      <nav className="rail" aria-label="Navegação principal">
        <button className="rail-button" aria-label="Início"><MiniIcon>⌂</MiniIcon></button>
        <button className="rail-button active" aria-label="Atendimentos"><MiniIcon>✚</MiniIcon><span>Atender</span></button>
        <button className="rail-button" aria-label="Pacientes"><MiniIcon>♧</MiniIcon><span>Pacientes</span></button>
        <button className="rail-button" aria-label="Agenda"><MiniIcon>▦</MiniIcon><span>Agenda</span></button>
        <button className="rail-button" aria-label="Relatórios"><MiniIcon>≡</MiniIcon><span>Gestão</span></button>
        <button className="rail-button rail-bottom" aria-label="Configurações"><MiniIcon>⚙</MiniIcon></button>
      </nav>

      <section className="workspace">
        <section className="patient-bar">
          <div className="patient-main">
            <span className="patient-avatar">MS</span>
            <div>
              <div className="patient-title"><h1>Maria das Dores Silva</h1><span className="tag-risk">Risco habitual</span></div>
              <p>58 anos • CNS 702 5086 2384 0001 • Nasc. 14/02/1968</p>
            </div>
          </div>
          <div className="persistent-facts">
            <span className="fact allergy"><small>ALERGIA</small> Dipirona <b>!</b></span>
            <span className="fact"><small>CONDIÇÕES</small> Hipertensão · Diabetes tipo 2</span>
            <span className="fact"><small>USO CONTÍNUO</small> Losartana 50 mg · Metformina 850 mg</span>
          </div>
          <button className="more-button" aria-label="Mais dados da paciente">•••</button>
        </section>

        <div className="content-grid">
          <section className="clinical-flow">
            <div className="encounter-heading">
              <div>
                <span className="eyebrow">ATENDIMENTO ATUAL</span>
                <h2>Consulta médica <span>• iniciada às 09:42</span></h2>
              </div>
              <button className="quiet-button">Encerrar atendimento</button>
            </div>

            <section className={`capture-card stage-${stage}`} aria-live="polite">
              {stage === "idle" && (
                <div className="capture-idle">
                  <div className="wave-orb" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                  <div>
                    <span className="eyebrow teal">ESCUTA AMBIENTE ASSISTIDA</span>
                    <h3>Atenda normalmente. A Lumos acompanha.</h3>
                    <p>Sem ditado: médico e paciente conversam, e o registro aparece estruturado em tempo real para revisão.</p>
                    <label className="consent-line"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} /> Paciente informada e de acordo com a escuta</label>
                  </div>
                  <button className="record-button" onClick={beginCapture} disabled={!consentConfirmed}><span className="mic-dot">●</span> Iniciar escuta ambiente <kbd>Ctrl Space</kbd></button>
                </div>
              )}

              {stage === "listening" && (
                <div className="capture-listening">
                  <div className="live-header">
                    <div><span className="live-dot" /> <strong>Escutando consulta</strong><span className="timer">{String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}</span></div>
                    <span>{voiceMode === "live" ? "Deepgram ao vivo" : voiceMode === "connecting" ? "Conectando áudio…" : "Demonstração segura"} • pt-BR</span>
                  </div>
                  <div className="ambient-live-grid">
                    <section className="conversation-panel" aria-label="Conversa transcrita ao vivo">
                      <div className="panel-caption"><span>CONVERSA AO VIVO</span><small>O médico foi identificado como o primeiro interlocutor</small></div>
                      <div className="speaker-feed">
                        {segments.length === 0 && !interimSegment && <p className="waiting-copy">Aguardando a primeira fala…</p>}
                        {[...segments, ...(interimSegment ? [interimSegment] : [])].map((segment, index) => (
                          <article className={`speaker-line speaker-${segment.speaker} ${interimSegment?.id === segment.id ? "interim" : ""}`} key={`${segment.id}-${index}`}>
                            <span>{segment.speaker === "medico" ? "Médico" : "Paciente"}</span>
                            <p>{segment.text}{interimSegment?.id === segment.id && <i className="caption-cursor" />}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                    <section className="live-structure-panel" aria-label="Registro clínico sendo estruturado">
                      <div className="panel-caption"><span>REGISTRO SENDO ESTRUTURADO</span><small>✦ Sugestões — revisão obrigatória</small></div>
                      <dl className="live-fields">
                        <div className={structured.queixa_principal ? "filled" : ""}><dt>Queixa principal</dt><dd>{structured.queixa_principal || "Aguardando contexto clínico…"}</dd></div>
                        <div className={structured.hda ? "filled" : ""}><dt>História atual</dt><dd>{structured.hda || "Aguardando informações…"}</dd></div>
                        <div className={structured.exame_fisico ? "filled" : ""}><dt>Exame físico</dt><dd>{structured.exame_fisico || "Ainda não mencionado"}</dd></div>
                        <div className={structured.diagnostico_sugerido ? "filled" : ""}><dt>Hipótese / CID sugerido</dt><dd>{structured.diagnostico_sugerido ? `${structured.diagnostico_sugerido}${structured.cid10_sugerido ? ` • ${structured.cid10_sugerido}` : ""}` : "Sem sugestão ainda"}</dd></div>
                        <div className={structured.conduta ? "filled" : ""}><dt>Conduta sugerida pela IA</dt><dd>{structured.conduta || "Aguardando contexto suficiente…"}</dd></div>
                        <div className={structured.exames_sugeridos.length ? "filled" : ""}><dt>Exames para aprovação</dt><dd>{structured.exames_sugeridos.length ? `${structured.exames_sugeridos.length} ${structured.exames_sugeridos.length === 1 ? "exame sugerido" : "exames sugeridos"}` : "Nenhum exame sugerido ainda"}</dd></div>
                        <div className={structured.medicamentos_sugeridos.length ? "filled" : ""}><dt>Receitas para aprovação</dt><dd>{structured.medicamentos_sugeridos.length ? `${structured.medicamentos_sugeridos.length} ${structured.medicamentos_sugeridos.length === 1 ? "medicamento identificado" : "medicamentos identificados"}` : "Nenhuma prescrição identificada"}</dd></div>
                      </dl>
                    </section>
                  </div>
                  <div className="listening-footer">
                    <div className="audio-status"><div className="audio-bars" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 48}ms` }} />)}</div><small>Áudio não é armazenado; somente o texto aprovado compõe o prontuário.</small></div>
                    <button className="stop-button" onClick={finishCapture}><span>■</span> Encerrar escuta e revisar</button>
                  </div>
                </div>
              )}

              {stage === "structuring" && (
                <div className="structuring-state">
                  <span className="ai-spinner"><i /><i /><i /></span>
                  <div><span className="eyebrow teal">ORGANIZANDO REGISTRO</span><h3>Consolidando os dados clínicos…</h3><p>A transcrição por interlocutor fica disponível para conferência.</p></div>
                </div>
              )}

              {(stage === "review" || stage === "saved") && (
                <div className="review-state">
                  <div className="review-heading">
                    <div><span className="success-mark">✓</span><div><span className="eyebrow teal">REGISTRO ESTRUTURADO</span><h3>{stage === "saved" ? "Registro confirmado" : "Revise antes de confirmar"}</h3></div></div>
                    <button className="text-button" onClick={() => setStage("idle")}>Descartar e recomeçar</button>
                  </div>
                  <div className="structured-grid">
                    <label className="field-span-2">Queixa principal <span className="confidence">Sugestão da IA</span><input value={structured.queixa_principal} onChange={(event) => updateStructured("queixa_principal", event.target.value)} disabled={stage === "saved"} /></label>
                    <label className="field-span-2">História da doença atual<textarea value={structured.hda} onChange={(event) => updateStructured("hda", event.target.value)} disabled={stage === "saved"} /></label>
                    <label>Exame físico<input value={structured.exame_fisico} onChange={(event) => updateStructured("exame_fisico", event.target.value)} disabled={stage === "saved"} /></label>
                    <label>Hipótese / CID sugerido {structured.cid10_sugerido && <span className="cid-chip">{structured.cid10_sugerido}</span>}<input value={structured.diagnostico_sugerido} onChange={(event) => updateStructured("diagnostico_sugerido", event.target.value)} disabled={stage === "saved"} /></label>
                    <label className="field-span-2">Conduta sugerida pela IA <span className="confidence">Revisão obrigatória</span><textarea value={structured.conduta} onChange={(event) => updateStructured("conduta", event.target.value)} disabled={stage === "saved"} /></label>
                  </div>
                  <section className="approval-section" aria-label="Sugestões aguardando aprovação médica">
                    <div className="approval-heading">
                      <div><span className="eyebrow teal">AÇÕES CLÍNICAS</span><h4>Exames e receitas</h4></div>
                      <span className={pendingApprovalCount ? "pending-count" : "resolved-count"}>{pendingApprovalCount ? `${pendingApprovalCount} aguardando aprovação` : "Todas as sugestões revisadas"}</span>
                    </div>
                    {!structured.exames_sugeridos.length && !structured.medicamentos_sugeridos.length && <p className="empty-approval">Nenhum exame ou medicamento foi sugerido a partir desta conversa.</p>}
                    {!!structured.exames_sugeridos.length && <div className="approval-list"><h5>Exames sugeridos</h5>{structured.exames_sugeridos.map((exam, index) => {
                      const status = examDecisions[index] ?? "pending";
                      return <article className={`approval-card status-${status}`} key={`exam-${index}`}>
                        <span className="action-kind">EXAME</span>
                        <div className="approval-fields"><input aria-label={`Nome do exame ${index + 1}`} value={exam.nome} onChange={(event) => updateExam(index, "nome", event.target.value)} disabled={stage === "saved" || status === "rejected"} /><textarea aria-label={`Justificativa do exame ${index + 1}`} value={exam.justificativa} onChange={(event) => updateExam(index, "justificativa", event.target.value)} disabled={stage === "saved" || status === "rejected"} /></div>
                        <div className="approval-controls"><span>{status === "pending" ? "Aguardando aprovação" : status === "approved" ? "Aprovado para o atendimento" : "Não incluir"}</span>{stage !== "saved" && <div><button className="reject-action" onClick={() => setExamDecisions((current) => ({ ...current, [index]: "rejected" }))}>Rejeitar</button><button className="approve-action" onClick={() => setExamDecisions((current) => ({ ...current, [index]: "approved" }))}>Aprovar</button></div>}</div>
                      </article>;
                    })}</div>}
                    {!!structured.medicamentos_sugeridos.length && <div className="approval-list"><h5>Receitas identificadas na conversa</h5>{structured.medicamentos_sugeridos.map((medication, index) => {
                      const status = medicationDecisions[index] ?? "pending";
                      return <article className={`approval-card medication-card status-${status}`} key={`medication-${index}`}>
                        <span className="action-kind prescription-kind">RECEITA</span>
                        <div className="medication-fields"><input aria-label={`Medicamento ${index + 1}`} value={medication.nome} onChange={(event) => updateMedication(index, "nome", event.target.value)} disabled={stage === "saved" || status === "rejected"} /><input aria-label={`Dose ${index + 1}`} value={medication.dose ?? ""} onChange={(event) => updateMedication(index, "dose", event.target.value)} disabled={stage === "saved" || status === "rejected"} /><input aria-label={`Frequência ${index + 1}`} value={medication.frequencia ?? ""} onChange={(event) => updateMedication(index, "frequencia", event.target.value)} disabled={stage === "saved" || status === "rejected"} /><input aria-label={`Duração ${index + 1}`} value={medication.duracao ?? ""} onChange={(event) => updateMedication(index, "duracao", event.target.value)} disabled={stage === "saved" || status === "rejected"} /></div>
                        <div className="approval-controls"><span>{status === "pending" ? "Aguardando aprovação" : status === "approved" ? "Aprovada para o atendimento" : "Não incluir"}</span>{stage !== "saved" && <div><button className="reject-action" onClick={() => setMedicationDecisions((current) => ({ ...current, [index]: "rejected" }))}>Rejeitar</button><button className="approve-action" onClick={() => setMedicationDecisions((current) => ({ ...current, [index]: "approved" }))}>Aprovar receita</button></div>}</div>
                      </article>;
                    })}</div>}
                  </section>
                  <details className="raw-transcript"><summary>Ver transcrição original</summary><p>{transcript || SAMPLE_TRANSCRIPT}</p></details>
                  <div className="review-actions">
                    {stage === "review" ? <><span>{pendingApprovalCount ? "Decida sobre cada exame e receita antes de assinar." : "Tudo revisado. Somente itens aprovados serão incluídos."}</span><button className="primary-button" onClick={confirmRecord} disabled={pendingApprovalCount > 0}>{pendingApprovalCount ? `Resolver ${pendingApprovalCount} pendências` : "Confirmar registro"} <span>✓</span></button></> : <><span className="saved-note"><b>✓</b> Prévia revisada — sem assinatura clínica</span><button className="quiet-button" onClick={() => setStage("idle")}>Novo registro</button></>}
                  </div>
                </div>
              )}
            </section>

            <div className="templates-row">
              <span>Começar com um modelo:</span>
              {templates.map((template) => <button key={template} className={selectedTemplate === template ? "selected" : ""} onClick={() => applyTemplate(template)}>{template}</button>)}
              <button className="template-more">Mais modelos +</button>
            </div>

            <section className="timeline-section">
              <div className="section-heading"><div><h3>Hoje</h3><span>15 de julho de 2026</span></div><button>Filtrar registros ⌄</button></div>
              {stage === "saved" && (
                <article className="timeline-item newest">
                  <div className="timeline-marker teal-marker">AL</div>
                  <button className="timeline-card timeline-card-button" onClick={() => setTimelineDetail("current")}><div className="timeline-meta"><strong>Consulta médica</strong><span>09:51 • Dra. Ana Lima</span></div><p>{structured.queixa_principal || "Consulta registrada e assinada."}</p><div className="timeline-tags"><span>Conduta registrada</span>{approvedExams.length > 0 && <span>{approvedExams.length} {approvedExams.length === 1 ? "exame solicitado" : "exames solicitados"}</span>}{approvedMedications.length > 0 && <span>{approvedMedications.length} {approvedMedications.length === 1 ? "receita emitida" : "receitas emitidas"}</span>}</div><small className="open-record">Abrir atendimento →</small></button>
                </article>
              )}
              <article className="timeline-item">
                <div className="timeline-marker">JM</div>
                <button className="timeline-card timeline-card-button" onClick={() => setTimelineDetail("triage")}><div className="timeline-meta"><strong>Triagem de enfermagem</strong><span>09:28 • Enf. João Mendes</span></div><div className="vitals"><span><small>PA</small><b>148/92</b> mmHg</span><span><small>FC</small><b>78</b> bpm</span><span><small>SpO₂</small><b>98</b> %</span><span><small>Glicemia</small><b>126</b> mg/dL</span></div><p>Refere cefaleia leve desde ontem. Nega outros sintomas. Classificação: não urgente.</p><small className="open-record">Abrir registro →</small></button>
              </article>
              <div className="past-label"><span>12 MAI</span><i /></div>
              <article className="timeline-item compact">
                <div className="timeline-marker muted">RC</div>
                <button className="timeline-card timeline-card-button" onClick={() => setTimelineDetail("followup")}><div className="timeline-meta"><strong>Acompanhamento de hipertensão</strong><span>12/05/2026 • Dr. Rafael Costa</span></div><p>PA controlada. Mantida losartana 50 mg/dia. Orientações de dieta e atividade física.</p><div className="timeline-tags"><span>Receita emitida</span></div><small className="open-record">Abrir atendimento →</small></button>
              </article>
            </section>
          </section>

          <aside className="context-panel">
            <section className="focus-card">
              <div className="focus-heading"><span className="spark">✦</span><div><span className="eyebrow teal">RESUMO PARA AGORA</span><h3>Antes de começar</h3></div></div>
              <ul>
                <li><span className="alert-bullet">!</span><div><strong>Alergia a dipirona</strong><small>Reação: urticária intensa</small></div></li>
                <li><span className="neutral-bullet">↗</span><div><strong>PA acima da meta</strong><small>148/92 mmHg na triagem</small></div></li>
                <li><span className="neutral-bullet">○</span><div><strong>Exame pendente</strong><small>HbA1c solicitada há 63 dias</small></div></li>
              </ul>
              <p className="focus-note">Resumo gerado a partir do histórico. Confirme com a paciente.</p>
            </section>

            <section className="quick-actions">
              <div className="aside-heading"><h3>Ações rápidas</h3><span>Atalhos</span></div>
              <button onClick={() => setQuickPanel("prescription")}><MiniIcon>Rx</MiniIcon><span><strong>Emitir receita</strong><small>Usar medicação atual</small></span><kbd>Alt R</kbd></button>
              <button onClick={() => setQuickPanel("exam")}><MiniIcon>⌁</MiniIcon><span><strong>Solicitar exame</strong><small>Protocolos da unidade</small></span><kbd>Alt E</kbd></button>
              <button onClick={() => setToast("Encaminhamento adicionado ao atendimento.")}><MiniIcon>↗</MiniIcon><span><strong>Encaminhar</strong><small>Especialidade ou serviço</small></span><span>›</span></button>
              <button onClick={() => setToast("Retorno em 30 dias sugerido.")}><MiniIcon>▣</MiniIcon><span><strong>Agendar retorno</strong><small>Próxima disponibilidade</small></span><span>›</span></button>
            </section>

            <section className="shortcuts-card">
              <span className="keyboard-glyph">⌨</span><div><strong>Trabalhe sem tirar as mãos do teclado</strong><p><kbd>Ctrl Space</kbd> inicia ou encerra a escuta.</p></div>
            </section>
          </aside>
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        <button className="active"><span>✚</span>Atender</button><button><span>♧</span>Pacientes</button><button><span>▦</span>Agenda</button><button><span>•••</span>Mais</button>
      </nav>

      {quickPanel && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setQuickPanel(null)}>
          <section className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow teal">AÇÃO RÁPIDA</span><h2 id="quick-modal-title">{quickPanel === "prescription" ? "Nova receita" : "Solicitar exame"}</h2></div><button onClick={() => setQuickPanel(null)} aria-label="Fechar">×</button></div>
            {quickPanel === "prescription" ? (
              <div className="modal-form">
                <label>Medicamento<input defaultValue="Losartana 50 mg" /></label>
                <div className="form-row"><label>Posologia<input defaultValue="1 comprimido pela manhã" /></label><label>Duração<select defaultValue="continuo"><option value="continuo">Uso contínuo</option><option value="30">30 dias</option></select></label></div>
                <label className="check-line"><input type="checkbox" defaultChecked /> Reutilizar dados da última receita</label>
              </div>
            ) : (
              <div className="modal-form">
                <label>Exames<input defaultValue="Creatinina, potássio e HbA1c" /></label>
                <label>Indicação clínica<textarea defaultValue="Acompanhamento de hipertensão e diabetes tipo 2." /></label>
                <label className="check-line"><input type="checkbox" /> Marcar como urgente</label>
              </div>
            )}
            <div className="modal-actions"><button className="quiet-button" onClick={() => setQuickPanel(null)}>Cancelar</button><button className="primary-button" onClick={() => { setQuickPanel(null); setToast(quickPanel === "prescription" ? "Receita simulada na demonstração." : "Pedido de exame simulado na demonstração."); }}>Adicionar ao atendimento <span>→</span></button></div>
          </section>
        </div>
      )}

      {timelineDetail && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setTimelineDetail(null)}>
          <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow teal">DETALHES DO ATENDIMENTO</span><h2 id="record-modal-title">{timelineDetail === "current" ? "Consulta médica" : timelineDetail === "triage" ? "Triagem de enfermagem" : "Acompanhamento de hipertensão"}</h2></div><button onClick={() => setTimelineDetail(null)} aria-label="Fechar">×</button></div>
            <div className="record-summary-bar"><span>{timelineDetail === "current" ? "Hoje, 09:51 • Dra. Ana Lima" : timelineDetail === "triage" ? "Hoje, 09:28 • Enf. João Mendes" : "12/05/2026 • Dr. Rafael Costa"}</span><b>Registro fictício de demonstração</b></div>
            <div className="record-detail-body">
              <section className="record-detail-section"><h3>Registro clínico</h3>{timelineDetail === "current" ? <><p><strong>Queixa principal</strong>{structured.queixa_principal || "Não informada"}</p><p><strong>História atual</strong>{structured.hda || "Não informada"}</p><p><strong>Exame físico</strong>{structured.exame_fisico || "Não informado"}</p><p><strong>Hipótese</strong>{structured.diagnostico_sugerido || "Não informada"}{structured.cid10_sugerido ? ` • CID ${structured.cid10_sugerido}` : ""}</p><p><strong>Conduta aprovada</strong>{structured.conduta || "Não informada"}</p></> : timelineDetail === "triage" ? <><p><strong>Motivo da procura</strong>Cefaleia leve desde ontem. Nega outros sintomas.</p><div className="detail-vitals"><span>PA <b>148/92</b></span><span>FC <b>78 bpm</b></span><span>SpO₂ <b>98%</b></span><span>Glicemia <b>126 mg/dL</b></span></div><p><strong>Classificação</strong>Não urgente</p></> : <><p><strong>Evolução</strong>PA controlada. Sem queixas ou sinais de alarme.</p><p><strong>Conduta</strong>Mantidas orientações de dieta, atividade física e tratamento anti-hipertensivo.</p></>}</section>
              <section className="record-detail-section"><h3>Exames solicitados</h3>{timelineDetail === "current" ? (approvedExams.length ? <ul>{approvedExams.map((exam, index) => <li key={`detail-exam-${index}`}><b>{exam.nome}</b><span>{exam.justificativa}</span></li>)}</ul> : <p className="empty-detail">Nenhum exame aprovado neste atendimento.</p>) : <p className="empty-detail">Nenhum exame solicitado neste registro.</p>}</section>
              <section className="record-detail-section"><h3>Receitas emitidas</h3>{timelineDetail === "current" ? (approvedMedications.length ? <ul>{approvedMedications.map((medication, index) => <li key={`detail-medication-${index}`}><b>{medication.nome} {medication.dose}</b><span>{[medication.via, medication.frequencia, medication.duracao].filter(Boolean).join(" • ")}</span></li>)}</ul> : <p className="empty-detail">Nenhuma receita aprovada neste atendimento.</p>) : timelineDetail === "followup" ? <ul><li><b>Losartana 50 mg</b><span>Via oral • 1 comprimido pela manhã • Uso contínuo</span></li></ul> : <p className="empty-detail">Nenhuma receita emitida neste registro.</p>}</section>
            </div>
            <div className="modal-actions"><button className="primary-button" onClick={() => setTimelineDetail(null)}>Fechar atendimento</button></div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
