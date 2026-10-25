import { useEffect, useRef, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ghost, Hand, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useActiveEmployee } from "./EmployeeGate";

import type { AccessRole } from "@/lib/access-policy";

import {
  announceManagerVisit, readFriendlyEvents, sendFriendlyPing,
  updateFriendlyPresence, type FriendlyEvent,
} from "@/lib/friendly-ping.functions";

type Operation = "Contagem" | "Conferência" | "Entregas";
type Area = Operation | "Fora";
function toArea(value: string | null): Area {
  return value === "Contagem" || value === "Conferência" || value === "Entregas" ? value : "Fora";
}

function FloatingMessage({ title, body, onPing, sending, onClose, kind }: {
  title: string;
  body: string;
  onPing?: () => void;
  sending?: boolean;
  onClose: () => void;
  kind: "peek" | "ping";
}) {
  return <div
    className="pointer-events-auto relative w-full max-w-[520px] max-h-[calc(100dvh-40px)] overflow-y-auto rounded-3xl border-2 border-[#79b7d7] bg-[#113351] px-5 py-7 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:px-8 sm:py-9"
    role="status" aria-live="polite"
  >
    <button type="button" onClick={onClose} aria-label="Fechar aviso"
      className="absolute right-3 top-3 rounded-full p-2 text-[#c9e7fa] hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">
      <X className="h-5 w-5" />
    </button>
    <span className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full shadow-lg ${kind === "peek" ? "bg-[#674191]" : "bg-[#188a7a]"}`}>
      {kind === "peek" ? <Ghost className="h-11 w-11" /> : <Hand className="h-11 w-11" />}
    </span>
    <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">{title}</h2>
    <p className="mx-auto mt-3 max-w-md break-words text-base font-medium leading-relaxed text-[#e5f5ff] sm:text-lg">{body}</p>
    {onPing && <Button type="button" onClick={onPing} disabled={sending}
      className="mt-6 h-12 w-full gap-2 rounded-xl bg-[#ffbf41] text-base font-extrabold text-[#173149] hover:bg-[#ffd36c]">
      <Hand className="h-5 w-5" /> {sending ? "Enviando ping…" : "Mandar ping 👉😂"}
    </Button>}
    <p className="mt-4 text-center text-xs text-[#acd1ed]">Este aviso desaparece após 10 segundos.</p>
  </div>;
}

export function FriendlyPingBridge({ role, currentArea }: { role: AccessRole; currentArea: string | null }) {
  const { employee } = useActiveEmployee();
  const heartbeat = useServerFn(updateFriendlyPresence);
  const announce = useServerFn(announceManagerVisit);
  const readEvents = useServerFn(readFriendlyEvents);
  const sendPing = useServerFn(sendFriendlyPing);


  const [clientId] = useState(() => crypto.randomUUID());
  const area = toArea(currentArea);
  const identityId = employee?.id;
  const seen = useRef(new Set<string>());
  const firstSeenAt = useRef(new Date().toISOString());
  const ready = useRef(false);
  const registeredArea = useRef<string | null>(null);
  const displayedError = useRef(new Set<string>());
  const emptyNotice = useRef(new Set<string>());
  // Mensagens centrais são independentes do posicionamento do Toaster global.
  // Uma fila evita que os pings de vários operadores se sobreponham.
  const [pendingNotices, setPendingNotices] = useState<FriendlyEvent[]>([]);
  const [sendingPingFor, setSendingPingFor] = useState<string | null>(null);
  const notice = pendingNotices[0] ?? null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setPendingNotices(current => current.filter(event => event.id !== notice.id));
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [notice?.id]);

  const dismissNotice = (id: string) =>
    setPendingNotices(current => current.filter(event => event.id !== id));

  const respondToNotice = async (event: FriendlyEvent) => {
    if (sendingPingFor) return;
    setSendingPingFor(event.id);
    try {
      await sendPing({ data: { clientId, sourceEventId: event.id } });
      dismissNotice(event.id);
      toast.success("Ping enviado ao gestor! 👉😂");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o ping.");
    } finally {
      setSendingPingFor(null);
    }
  };


  useEffect(() => {
    if (!identityId) { ready.current = false; registeredArea.current = null; return; }
    if (area === "Fora") registeredArea.current = null;
    let cancelled = false;
    let inFlight = false;
    ready.current = false;
    const register = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        await heartbeat({ data: { clientId, area } });
        if (cancelled) return;
        ready.current = true;
        const visitKey = identityId + ":" + area;
        if (role === "gestor" && area !== "Fora" && registeredArea.current !== visitKey) {
          try {
            const result = await announce({ data: { clientId, area } });
            if (cancelled) return;
            if (result.sent > 0) registeredArea.current = visitKey;
            else if (!emptyNotice.current.has(visitKey)) {
              emptyNotice.current.add(visitKey);
              toast.message("Ainda não há operador conectado em " + area, {
                description: "O aviso será enviado quando um operador entrar nessa área.",
                duration: 5000,
              });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Falha ao enviar aviso ao operador.";
            console.warn("[BigLogno] Aviso ao operador:", e);
            if (!displayedError.current.has(visitKey + msg)) {
              displayedError.current.add(visitKey + msg);
              toast.error("Aviso do gestor não enviado", { description: msg, duration: 8000 });
            }
          }
        }
      } catch (e) {
        ready.current = false;
        // Os avisos são opcionais; falhas não interrompem a operação.
        console.warn("[BigLogno] Presença indisponível:", e);
        const msg = e instanceof Error ? e.message : "Conexão com avisos indisponível.";
        const errKey = area + ":" + msg;
        if (role === "gestor" && !displayedError.current.has(errKey)) {
          displayedError.current.add(errKey);
          toast.error("Ping entre gestor e operador indisponível", { description: msg, duration: 9000 });
        }
      } finally { inFlight = false; }
    };
    void register();
    const interval = window.setInterval(() => { void register(); }, 8000);
    return () => {
      cancelled = true;
      ready.current = false;
      window.clearInterval(interval);
    };
  }, [role, identityId, clientId, area, heartbeat, announce]);

  useEffect(() => {
    if (!identityId) return;
    let cancelled = false;
    let running = false;
    const poll = async () => {
      if (cancelled || running || !ready.current) return;
      running = true;
      try {
        const events = await readEvents({ data: { clientId, after: firstSeenAt.current } });
        if (cancelled) return;
        for (const event of events) {
          if (seen.current.has(event.id) || event.created_at < firstSeenAt.current) continue;
          seen.current.add(event.id);
          if (
            (event.kind === "peek" && role === "operador" && area === event.area) ||
            (event.kind === "ping" && role === "gestor")
          ) {
            setPendingNotices(current => [...current, event]);
          }
        }
        if (seen.current.size > 300) {
          seen.current = new Set(events.map(e => e.id));
        }
      } catch (e) {
        console.warn("[BigLogno] Leitura dos avisos:", e);
      } finally { running = false; }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [role, area, identityId, clientId, readEvents, sendPing]);

  return <>
    {notice && <div
      className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#061526]/55 px-4 py-6"
      aria-label="Aviso divertido entre gestor e operador"
    >
      <FloatingMessage
        key={notice.id}
        kind={notice.kind}
        title={notice.kind === "peek" ? "Opa, visita surpresa! 👻" : "Recebeu um cutucão! 😂"}
        body={notice.kind === "peek"
          ? `Sorria! O gestor ${notice.actor_name} está espiando seu resultado! 👀😱😂`
          : `O(a) operador(a) ${notice.actor_name} está te cutucando! 👉😂`}
        onClose={() => dismissNotice(notice.id)}
        onPing={notice.kind === "peek" ? () => { void respondToNotice(notice); } : undefined}
        sending={sendingPingFor === notice.id}
      />
    </div>}
  </>;
}
