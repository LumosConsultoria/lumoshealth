"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";

type CaptureStage = "idle" | "listening" | "structuring" | "review" | "saved";
type QuickPanel = "prescription" | "exam" | null;

const SAMPLE_TRANSCRIPT =
  "Dona Maria relata dor de cabeça leve desde ontem, sem náusea ou alteração visual. Pressão hoje cento e quarenta e oito por noventa e dois. Mantém uso regular de losartana cinquenta miligramas pela manhã. Ao exame está em bom estado geral, orientada, hidratada e sem déficit neurológico. Vamos reforçar as medidas de controle, solicitar função renal e retornar em trinta dias.";

const TRANSCRIPT_PARTS = [
  "Dona Maria relata dor de cabeça leve desde ontem,",
  " sem náusea ou alteração visual.",
  " Pressão hoje 148 por 92.",
  " Mantém uso regular de losartana 50 mg pela manhã.",
  " Ao exame está em bom estado geral, orientada e hidratada,",
  " sem déficit neurológico.",
  " Vamos reforçar as medidas de controle, solicitar função renal",
  " e retornar em 30 dias.",
];

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
          <p>Registre a consulta com a sua voz. A Lumos organiza, você cuida.</p>
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
            <span className="eyebrow">ACESSO PROFISSIONAL</span>
            <h2>Bom atendimento começa aqui.</h2>
            <p>Entre com os dados da sua unidade.</p>
          </div>
          <label>
            CPF
            <input name="cpf" inputMode="numeric" defaultValue="123.456.789-00" aria-label="CPF" />
          </label>
          <label>
            Senha
            <input name="password" type="password" defaultValue="lumos2026" aria-label="Senha" />
          </label>
          <label>
            Categoria profissional
            <select name="category" defaultValue="medico" aria-label="Categoria profissional">
              <option value="medico">Médico(a)</option>
              <option value="enfermeiro">Enfermeiro(a)</option>
              <option value="tecnico">Técnico(a) de enfermagem</option>
            </select>
          </label>
          <button className="primary-button login-button" type="submit">Entrar no atendimento <span>→</span></button>
          <div className="secure-note"><span>✓</span> Ambiente seguro e auditado • LGPD</div>
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
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMedia = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorder.current = null;
  }, []);

  const beginCapture = useCallback(async () => {
    setTranscript("");
    setTimer(0);
    setStage("listening");

    let index = 0;
    transcriptTimer.current = setInterval(() => {
      setTranscript((current) => current + (TRANSCRIPT_PARTS[index] ?? ""));
      index += 1;
      if (index >= TRANSCRIPT_PARTS.length && transcriptTimer.current) {
        clearInterval(transcriptTimer.current);
      }
    }, 760);
    clockTimer.current = setInterval(() => setTimer((current) => current + 1), 1000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.current = recorder;
      recorder.start(500);
    } catch {
      setToast("Microfone indisponível — o modo de demonstração continua ativo.");
    }
  }, []);

  const finishCapture = useCallback(() => {
    if (transcriptTimer.current) clearInterval(transcriptTimer.current);
    if (clockTimer.current) clearInterval(clockTimer.current);
    stopMedia();
    setTranscript((current) => current || SAMPLE_TRANSCRIPT);
    setStage("structuring");
    window.setTimeout(() => setStage("review"), 1250);
  }, [stopMedia]);

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
  }, [beginCapture, finishCapture, stage]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function useTemplate(template: string) {
    setSelectedTemplate(template);
    if (template === "Renovar receita") {
      setQuickPanel("prescription");
      return;
    }
    setToast(`Template de ${template} preparado.`);
  }

  async function confirmRecord() {
    setStage("saved");
    const draft = { transcript: transcript || SAMPLE_TRANSCRIPT, category: "consulta_medica" };
    if (!online) {
      localStorage.setItem("lumos.pending-record", JSON.stringify(draft));
      setToast("Registro salvo neste dispositivo. Sincronizaremos depois.");
      return;
    }

    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("sync failed");
      localStorage.removeItem("lumos.pending-record");
      setToast("Registro confirmado e sincronizado.");
    } catch {
      localStorage.setItem("lumos.pending-record", JSON.stringify(draft));
      setToast("Registro confirmado. A sincronização continuará em segundo plano.");
    }
  }

  if (!authenticated) return <Login onEnter={() => setAuthenticated(true)} />;

  return (
    <main className="app-shell">
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
                    <span className="eyebrow teal">REGISTRO POR VOZ</span>
                    <h3>Converse. A Lumos organiza.</h3>
                    <p>Fale naturalmente durante o atendimento. Você revisa tudo antes de salvar.</p>
                  </div>
                  <button className="record-button" onClick={beginCapture}><span className="mic-dot">●</span> Iniciar escuta <kbd>Ctrl Space</kbd></button>
                </div>
              )}

              {stage === "listening" && (
                <div className="capture-listening">
                  <div className="live-header">
                    <div><span className="live-dot" /> <strong>Escutando</strong><span className="timer">{String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}</span></div>
                    <span>Deepgram Nova-3 • pt-BR</span>
                  </div>
                  <div className="live-caption">{transcript}<span className="caption-cursor" /></div>
                  <div className="listening-footer">
                    <div className="audio-bars" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 48}ms` }} />)}</div>
                    <button className="stop-button" onClick={finishCapture}><span>■</span> Finalizar registro</button>
                  </div>
                </div>
              )}

              {stage === "structuring" && (
                <div className="structuring-state">
                  <span className="ai-spinner"><i /><i /><i /></span>
                  <div><span className="eyebrow teal">ORGANIZANDO REGISTRO</span><h3>Separando os dados clínicos…</h3><p>A fala original fica preservada para auditoria.</p></div>
                </div>
              )}

              {(stage === "review" || stage === "saved") && (
                <div className="review-state">
                  <div className="review-heading">
                    <div><span className="success-mark">✓</span><div><span className="eyebrow teal">REGISTRO ESTRUTURADO</span><h3>{stage === "saved" ? "Registro confirmado" : "Revise antes de confirmar"}</h3></div></div>
                    <button className="text-button" onClick={() => setStage("idle")}>Descartar e recomeçar</button>
                  </div>
                  <div className="structured-grid">
                    <label className="field-span-2">Queixa principal <span className="confidence">Alta confiança</span><input defaultValue="Cefaleia leve e aferição de pressão elevada desde ontem." disabled={stage === "saved"} /></label>
                    <label className="field-span-2">História da doença atual<textarea defaultValue="Nega náusea, vômitos e alterações visuais. Refere uso regular de losartana 50 mg pela manhã." disabled={stage === "saved"} /></label>
                    <label>Exame físico<input defaultValue="BEG, orientada, hidratada, sem déficit neurológico." disabled={stage === "saved"} /></label>
                    <label>Hipótese / CID sugerido <span className="cid-chip">I10</span><input defaultValue="Hipertensão arterial sistêmica" disabled={stage === "saved"} /></label>
                    <label className="field-span-2">Conduta<textarea defaultValue="Reforçadas medidas não farmacológicas. Solicitar creatinina e potássio. Retorno em 30 dias." disabled={stage === "saved"} /></label>
                  </div>
                  <details className="raw-transcript"><summary>Ver transcrição original</summary><p>{transcript || SAMPLE_TRANSCRIPT}</p></details>
                  <div className="review-actions">
                    {stage === "review" ? <><span>Todos os campos podem ser editados.</span><button className="primary-button" onClick={confirmRecord}>Confirmar registro <span>✓</span></button></> : <><span className="saved-note"><b>✓</b> Assinado por Dra. Ana Lima às 09:51</span><button className="quiet-button" onClick={() => setStage("idle")}>Novo registro</button></>}
                  </div>
                </div>
              )}
            </section>

            <div className="templates-row">
              <span>Começar com um modelo:</span>
              {templates.map((template) => <button key={template} className={selectedTemplate === template ? "selected" : ""} onClick={() => useTemplate(template)}>{template}</button>)}
              <button className="template-more">Mais modelos +</button>
            </div>

            <section className="timeline-section">
              <div className="section-heading"><div><h3>Hoje</h3><span>15 de julho de 2026</span></div><button>Filtrar registros ⌄</button></div>
              {stage === "saved" && (
                <article className="timeline-item newest">
                  <div className="timeline-marker teal-marker">AL</div>
                  <div className="timeline-card"><div className="timeline-meta"><strong>Consulta médica</strong><span>09:51 • Dra. Ana Lima</span></div><p>Cefaleia leve associada a PA elevada. Sem sinais de alarme. CID I10.</p><div className="timeline-tags"><span>Conduta registrada</span><span>Exame solicitado</span></div></div>
                </article>
              )}
              <article className="timeline-item">
                <div className="timeline-marker">JM</div>
                <div className="timeline-card"><div className="timeline-meta"><strong>Triagem de enfermagem</strong><span>09:28 • Enf. João Mendes</span></div><div className="vitals"><span><small>PA</small><b>148/92</b> mmHg</span><span><small>FC</small><b>78</b> bpm</span><span><small>SpO₂</small><b>98</b> %</span><span><small>Glicemia</small><b>126</b> mg/dL</span></div><p>Refere cefaleia leve desde ontem. Nega outros sintomas. Classificação: não urgente.</p></div>
              </article>
              <div className="past-label"><span>12 MAI</span><i /></div>
              <article className="timeline-item compact">
                <div className="timeline-marker muted">RC</div>
                <div className="timeline-card"><div className="timeline-meta"><strong>Acompanhamento de hipertensão</strong><span>12/05/2026 • Dr. Rafael Costa</span></div><p>PA controlada. Mantida losartana 50 mg/dia. Orientações de dieta e atividade física.</p></div>
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
            <div className="modal-actions"><button className="quiet-button" onClick={() => setQuickPanel(null)}>Cancelar</button><button className="primary-button" onClick={() => { setQuickPanel(null); setToast(quickPanel === "prescription" ? "Receita adicionada ao atendimento." : "Pedido de exame adicionado ao atendimento."); }}>Adicionar ao atendimento <span>→</span></button></div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
