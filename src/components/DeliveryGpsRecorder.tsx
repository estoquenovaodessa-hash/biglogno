import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { recordGpsDistance } from "@/lib/delivery-gps.functions";
import { gpsDistanceDecision, validGpsFix, type GpsFix } from "@/lib/delivery-gps";

type GpsStatus = "idle" | "starting" | "active" | "paused" | "denied" | "unavailable" | "imprecise" | "error";

/** Captura distância em GPS somente enquanto o entregador permanece na tela
 * de Entregas, com o pedido em rota e geolocalização autorizada.
 * Jamais persiste latitude e longitude, só incrementos de metros. */
export function DeliveryGpsRecorder({ deliveryId, enabled }: {
  deliveryId: string | null;
  enabled: boolean;
}) {
  const send = useServerFn(recordGpsDistance);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [detail, setDetail] = useState("");
  const [measurements, setMeasurements] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled || !deliveryId) {
      setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) {
      setStatus("unavailable");
      return;
    }

    let alive = true;
    let watchId: number | null = null;
    let previous: GpsFix | null = null;
    let sessionId = crypto.randomUUID();
    let inflight = false;

    const clearWatch = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      previous = null; // nunca calcula distância atravessando suspensão da página
    };
    const observe = (position: GeolocationPosition) => {
      if (!alive || document.visibilityState !== "visible") return;
      const fix: GpsFix = {
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, timestamp: position.timestamp,
      };
      if (!validGpsFix(fix)) {
        setStatus("imprecise");
        return;
      }
      setStatus("active");
      setDetail("");
      if (!previous) { previous = fix; return; }
      const start = previous;
      const decision = gpsDistanceDecision(start, fix);
      if (decision.kind === "skip") return;
      previous = fix;
      if (decision.kind !== "segment" || inflight) return;

      inflight = true;
      void sendRef.current({ data: {
        eventId: crypto.randomUUID(),
        sessionId,
        deliveryId,
        startedAt: new Date(start.timestamp).toISOString(),
        finishedAt: new Date(fix.timestamp).toISOString(),
        distanceMeters: decision.meters,
      } }).then(result => {
        if (alive && result.ok) setMeasurements(count => count + 1);
      }).catch(error => {
        if (alive) {
          setStatus("error");
          setDetail(error instanceof Error ? error.message : "Erro no registro GPS.");
        }
      }).finally(() => { inflight = false; });
    };
    const onError = (error: GeolocationPositionError) => {
      if (!alive) return;
      clearWatch();
      setStatus(error.code === 1 ? "denied" : "error");
      setDetail(error.code === 1
        ? "Autorize a localização do navegador para medir os quilômetros."
        : "GPS indisponível ou sem sinal neste momento.");
    };
    const startWatch = () => {
      if (!alive || document.visibilityState !== "visible" || watchId !== null) return;
      previous = null;
      sessionId = crypto.randomUUID();
      setStatus("starting");
      watchId = navigator.geolocation.watchPosition(observe, onError, {
        enableHighAccuracy: true, maximumAge: 5000, timeout: 20000,
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearWatch();
        if (alive) setStatus("paused");
      } else startWatch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    startWatch();
    return () => {
      alive = false;
      clearWatch();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [deliveryId, enabled, retry]);

  if (!enabled) return null;
  const icon = status === "active" ? <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
    : status === "idle" || status === "starting" ? <Navigation2 className="h-4 w-4 shrink-0 text-sky-400" />
      : <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />;
  const text = status === "idle" ? "GPS de quilômetros: inicia ao sair para uma entrega."
    : status === "starting" ? "Aguardando sinal e permissão do GPS..."
      : status === "active" ? "GPS ativo: registrando quilômetros durante o trajeto."
        : status === "paused" ? "Medição pausada: abra novamente esta tela para continuar."
          : status === "denied" ? "Permissão de localização negada."
            : status === "unavailable" ? "GPS indisponível: use HTTPS e um navegador com localização."
              : status === "imprecise" ? "Sinal GPS impreciso: aguardando posição confiável."
                : "GPS sem registro: verifique conexão e localização.";
  return <div className="rounded-lg border border-[#315887] bg-[#101f32] px-3 py-2.5 text-xs text-[#c1d9f6]"
    role="status" aria-live="polite">
    <div className="flex items-start gap-2">{icon}<span className="font-semibold">{text}</span></div>
    {detail && <p className="mt-1 text-amber-200">{detail}</p>}
    {(status === "denied" || status === "error" || status === "unavailable") && <Button
      type="button" size="sm" variant="outline" className="mt-2 h-8 border-[#5288bb] bg-transparent text-xs text-white hover:bg-[#234261]"
      onClick={() => setRetry(value => value + 1)}>
      Tentar GPS novamente
    </Button>}
    {measurements > 0 && <p className="mt-1 text-emerald-200">{measurements} trecho(s) de GPS registrado(s) nesta sessão.</p>}
    <p className="mt-1 flex items-start gap-1 text-[11px] text-[#9db8d8]">
      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
      Mede apenas em rota, com esta tela aberta e localização permitida. Não salva suas coordenadas.
    </p>
  </div>;
}
