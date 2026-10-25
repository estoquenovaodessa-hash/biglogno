import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ghost, Hand, Smile, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveEmployee, EmployeeAvatar } from "./EmployeeGate";
import type { Employee } from "@/lib/employees";
import type { AccessRole } from "@/lib/access-policy";
import { currentEmployee, listEmployees, selectEmployee } from "@/lib/employees.functions";
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
  const { employee: selectedOperator } = useActiveEmployee();
  const queryClient = useQueryClient();
  const getManager = useServerFn(currentEmployee);
  const getEmployees = useServerFn(listEmployees);
  const chooseManager = useServerFn(selectEmployee);
  const heartbeat = useServerFn(updateFriendlyPresence);
  const announce = useServerFn(announceManagerVisit);
  const readEvents = useServerFn(readFriendlyEvents);
  const sendPing = useServerFn(sendFriendlyPing);

  const manager = useQuery({
    queryKey: ["friendly-manager-profile"],
    queryFn: () => getManager(),
    enabled: role === "gestor",
    staleTime: 60000, refetchOnWindowFocus: false,
  });
  const managers = useQuery({
    queryKey: ["friendly-manager-options"],
    queryFn: () => getEmployees(),
    enabled: role === "gestor" && manager.isSuccess && !manager.data,
    staleTime: 60000, refetchOnWindowFocus: false,
  });

  const [clientId] = useState(() => crypto.randomUUID());
  const [dismissedArea, setDismissedArea] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const area = toArea(currentArea);
  const identity = role === "gestor" ? manager.data : selectedOperator;
  const identityId = identity?.id;
  const seen = useRef(new Set<string>());
  const firstSeenAt = useRef(new Date().toISOString());
  const ready = useRef(false);
  const registeredArea = useRef<string | null>(null);

  // Não interrompe a navegação do gestor: pode dispensar a escolha nesta aba.
  useEffect(() => { setDismissedArea(null); }, [area]);
  const chooseOpen = role === "gestor" && area !== "Fora"
    && manager.isSuccess && !manager.data && dismissedArea !== area;

  async function choose(employee: Employee) {
    setChoosing(true); setChoiceError("");
    try {
      const active = await chooseManager({ data: { id: employee.id } });
      queryClient.setQueryData(["friendly-manager-profile"], active);
    } catch (e) { setChoiceError(e instanceof Error ? e.message : "Não foi possível escolher o perfil."); }
    finally { setChoosing(false); }
  }

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
          registeredArea.current = visitKey;
          try { await announce({ data: { clientId, area } }); }
          catch (e) { console.warn("[BigLogno] Aviso ao operador:", e); }
        }
      } catch (e) {
        ready.current = false;
        // Os avisos são opcionais; falhas não interrompem a operação.
        console.warn("[BigLogno] Presença indisponível:", e);
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

  if (role !== "gestor") return null;
  return <Dialog open={chooseOpen} onOpenChange={open => { if (!open && !choosing) setDismissedArea(area); }}>
    <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg font-bold"><Smile className="h-6 w-6 text-primary" /> Quem está acompanhando?</DialogTitle>
        <DialogDescription>Escolha seu perfil de gestor para enviar avisos divertidos aos operadores da área {area}. Isso não altera os resultados.</DialogDescription>
      </DialogHeader>
      {choiceError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{choiceError}</p>}
      <div className="max-h-[48dvh] space-y-2 overflow-y-auto">
        {(managers.data ?? []).filter(e => e.active && e.role === "GESTOR").map(e =>
          <button key={e.id} type="button" disabled={choosing}
            onClick={() => { void choose(e); }}
            className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent disabled:opacity-60">
            <EmployeeAvatar employee={e} />
            <span className="min-w-0"><strong className="block truncate">{e.name}</strong><span className="text-xs text-muted-foreground">{e.job}</span></span>
          </button>
        )}
        {managers.isLoading && <p className="text-sm text-muted-foreground">Carregando gestores…</p>}
        {managers.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os perfis. Verifique a conexão.</p>}
        {managers.isSuccess && !(managers.data ?? []).some(e => e.active && e.role === "GESTOR") &&
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><Users className="mb-2 h-5 w-5" />Cadastre um funcionário com cargo GESTOR para utilizar os avisos com nome.</p>}
      </div>
      <Button variant="outline" disabled={choosing} onClick={() => setDismissedArea(area)}>Agora não</Button>
    </DialogContent>
  </Dialog>;
}
