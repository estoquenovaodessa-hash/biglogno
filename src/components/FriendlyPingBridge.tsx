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

function FloatingMessage({ title, body, action, onClose, kind }: {
  title: string; body: string; action?: () => void; onClose: () => void; kind: "peek" | "ping";
}) {
  return <div className="w-[min(92vw,395px)] rounded-2xl border border-[#6ba9c6] bg-[#113351] p-4 text-white shadow-2xl shadow-black/40" role="status">
    <div className="flex items-start gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${kind === "peek" ? "bg-[#674191]" : "bg-[#188a7a]"}`}>
        {kind === "peek" ? <Ghost className="h-6 w-6" /> : <Hand className="h-6 w-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-base font-extrabold">{title}</strong>
        <p className="mt-1 text-sm leading-relaxed text-[#e5f5ff]">{body}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Fechar aviso" className="rounded-full p-1 hover:bg-white/15"><X className="h-4 w-4" /></button>
    </div>
    {action && <Button type="button" onClick={action}
      className="mt-3 h-10 w-full gap-2 rounded-xl bg-[#ffbf41] font-extrabold text-[#173149] hover:bg-[#ffd36c]">
      <Hand className="h-4 w-4" /> Mandar ping 👉😂
    </Button>}
    <p className="mt-2 text-right text-[11px] text-[#acd1ed]">Este aviso desaparece em 10 segundos.</p>
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
          if (event.kind === "peek" && role === "operador" && area === event.area) {
            const toastId = event.id;
            toast.custom(() => <FloatingMessage
              kind="peek" title="Opa, visita surpresa! 👻"
              body={`Sorria! O gestor ${event.actor_name} está espiando seu resultado! 👀😱😂`}
              onClose={() => toast.dismiss(toastId)}
              action={() => {
                void sendPing({ data: { clientId, sourceEventId: event.id } })
                  .then(() => { toast.dismiss(toastId); toast.success("Ping enviado ao gestor! 👉😂"); })
                  .catch(e => toast.error(e instanceof Error ? e.message : "Não foi possível enviar o ping."));
              }}
            />, { id: toastId, duration: 10000 });
          } else if (event.kind === "ping" && role === "gestor") {
            toast.custom(() => <FloatingMessage
              kind="ping" title="Recebeu um cutucão! 😂"
              body={`O(a) operador(a) ${event.actor_name} está te cutucando! 👉😂`}
              onClose={() => toast.dismiss(event.id)}
            />, { id: event.id, duration: 10000 });
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

  return null;
}
