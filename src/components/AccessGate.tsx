import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LockKeyhole, LogIn, Eye, EyeOff, Download, MonitorDown,
  Truck, MapPin, Package, Route, ArrowUpRight,
} from "lucide-react";
import { getAccess, unlockAccess } from "@/lib/access.functions";
import type { AccessRole } from "@/lib/access-policy";
import symbol from "@/assets/bignotto-symbol.png.asset.json";
import "./access-gate.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** Tela pública apenas visual; a autenticação continua sendo feita pelo servidor. */
export function AccessGate({ children }: { children: (role: AccessRole, onExit: () => void) => ReactNode }) {
  const [role, setRole] = useState<AccessRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [runningAsApp, setRunningAsApp] = useState(false);
  const get = useServerFn(getAccess);
  const unlock = useServerFn(unlockAccess);

  useEffect(() => {
    let alive = true;
    get().then((data) => { if (alive) setRole(data.role); })
      .catch(() => { if (alive) setError("Não foi possível verificar o acesso. Tente novamente."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [get]);

  useEffect(() => {
    const updateDisplayMode = () => setRunningAsApp(
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstallHelp(false);
      setRunningAsApp(true);
    };
    updateDisplayMode();
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installWebApp() {
    if (!installEvent) {
      setInstallHelp(true);
      return;
    }
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
      setInstallHelp(false);
    } catch {
      setInstallHelp(true);
    }
  }

  if (role) return children(role, () => { setRole(null); setPassword(""); setError(""); });

  return (
    <main className="biglog-access">
      <div className="biglog-access__glow" aria-hidden="true" />
      <div className="biglog-access__decor" aria-hidden="true">
        <Truck className="biglog-access__icon biglog-access__icon--truck" />
        <MapPin className="biglog-access__icon biglog-access__icon--pin" />
        <Package className="biglog-access__icon biglog-access__icon--box" />
        <Route className="biglog-access__icon biglog-access__icon--route" />
      </div>
      <div className="biglog-access__layout">
        <section className="biglog-access__content" aria-label="Acesso ao BigLog">
          <header className="biglog-access__brand">
            <span className="biglog-access__brand-mark">
              <img src={symbol.url} alt="" />
            </span>
            <h1><span>Big</span><strong>Log</strong></h1>
          </header>
          <div className="biglog-access__underline" aria-hidden="true" />
          <div className="biglog-access__panel">
            <div className="biglog-access__panel-title">
              <span className="biglog-access__lock"><LockKeyhole size={27} strokeWidth={2.5} /></span>
              <h2>Acesse sua conta</h2>
            </div>

            {loading ? (
              <p className="biglog-access__loading" role="status">Verificando acesso…</p>
            ) : (
              <form onSubmit={async (event) => {
                event.preventDefault(); setBusy(true); setError("");
                try {
                  const result = await unlock({ data: { password } });
                  if (result.role) {
                    const verified = await get();
                    if (verified.role) { setPassword(""); setRole(verified.role); }
                    else setError("Não foi possível manter seu acesso. Permita cookies e tente entrar novamente.");
                  } else setError(result.error ?? "Senha incorreta.");
                } catch { setError("Não foi possível entrar. Tente novamente."); }
                finally { setBusy(false); }
              }}>
                <label className="biglog-access__label" htmlFor="access-password">Senha de acesso</label>
                <div className="biglog-access__field">
                  <input
                    id="access-password" type={visible ? "text" : "password"}
                    autoComplete="current-password" required maxLength={256}
                    value={password} onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "biglog-access-error" : undefined}
                  />
                  <button type="button" className="biglog-access__show-password"
                    onClick={() => setVisible(!visible)}
                    aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  >{visible ? <EyeOff size={23} /> : <Eye size={23} />}</button>
                </div>
                {error && <p id="biglog-access-error" role="alert" className="biglog-access__error">{error}</p>}
                <button type="submit" className="biglog-access__enter" disabled={busy}>
                  <LogIn size={26} /><span>{busy ? "Entrando…" : "Entrar"}</span>
                </button>
              </form>
            )}

            {!runningAsApp && (
              <section className="biglog-access__install" aria-label="Instalar BigLog">
                <div className="biglog-access__section-heading"><span>Use o BigLog como aplicativo</span></div>
                <div className="biglog-access__install-options">
                  <a className="biglog-access__download" href="/downloads/BigLogno-Windows.exe" download="BigLogno-Windows.exe">
                    <span className="biglog-access__app-icon biglog-access__app-icon--win" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 3.3 10.7 2v9.3H1zm10.8-1.5L23 0v11.3H11.8zM1 12.4h9.7v9.3L1 20.4zm10.8 0H23V24l-11.2-1.7z"/></svg>
                    </span>
                    <span className="biglog-access__install-copy"><strong>Baixar BigLog</strong><small>para Windows</small></span>
                    <Download size={24} aria-hidden="true" />
                  </a>
                  <button type="button" className="biglog-access__download biglog-access__download--browser" onClick={installWebApp}>
                    <MonitorDown size={27} aria-hidden="true" />
                    <span className="biglog-access__install-copy"><strong>Instalar BigLog</strong><small>pelo navegador</small></span>
                    <ArrowUpRight size={24} aria-hidden="true" />
                  </button>
                </div>
                {installHelp && (
                  <p role="status" className="biglog-access__help">
                    No Chrome ou Edge, abra o menu (⋮ ou ···) e procure por <strong>Instalar este site como aplicativo</strong> ou <strong>Apps → Instalar</strong>. No celular, use <strong>Adicionar à tela inicial</strong>.
                  </p>
                )}
                <p className="biglog-access__note">O aplicativo precisa de internet para acessar os dados.</p>
              </section>
            )}
          </div>
        </section>
        <aside className="biglog-access__art" aria-label="Mascote do BigLog">
          <img src="/images/biglog-mascot.avif" width={530} height={895} alt="Mascote do BigLog dando sinal de positivo" />
        </aside>
      </div>
    </main>
  );
}
