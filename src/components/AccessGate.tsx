import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, EyeOff, LogIn, MonitorDown, LockKeyhole } from "lucide-react";
import { getAccess, unlockAccess } from "@/lib/access.functions";
import type { AccessRole } from "@/lib/access-policy";
import "./access-gate.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * BigLog: composição fiel à arte aprovada, sem o antigo recorte retangular do mascote.
 * A imagem é exclusivamente visual: autenticação, instalação, senha e downloads
 * permanecem controles React reais, operados pelo teclado e com acessibilidade.
 */
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

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    setBusy(true);
    setError("");
    try {
      const result = await unlock({ data: { password } });
      if (result.role) {
        const verified = await get();
        if (verified.role) {
          setPassword("");
          setRole(verified.role);
        } else {
          setError("Não foi possível manter seu acesso. Permita cookies e tente entrar novamente.");
        }
      } else {
        setError(result.error ?? "Senha incorreta.");
      }
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (role) return children(role, () => { setRole(null); setPassword(""); setError(""); });

  return (
    <main className="biglog-login" aria-label="Acesso BigLog">
      {/* Desktop: uma única arte integral. Não há imagem retangular do mascote sobreposta. */}
      <div className="biglog-login__scene">
        <img
          className="biglog-login__artwork"
          src="/images/biglog-login-approved.avif"
          width={1672} height={941}
          alt="BigLog: identidade em azul e amarelo com mascote da Bignotto ao lado direito"
        />
        <form className="biglog-login__desktop-form" onSubmit={submitLogin}>
          <label className="biglog-login__sr-only" htmlFor="biglog-access-password">Senha de acesso</label>
          <div className="biglog-login__password-wrap">
            <input
              id="biglog-access-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required maxLength={256}
              value={password}
              disabled={loading || busy}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "biglog-login-error" : undefined}
            />
            <button type="button" onClick={() => setVisible(!visible)}
              aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
              className="biglog-login__visibility-button">{visible ? <EyeOff size={22} /> : <Eye size={22} />}</button>
          </div>
          <button className="biglog-login__submit-hotspot" type="submit" disabled={loading || busy}
            aria-label={loading ? "Verificando acesso" : busy ? "Entrando" : "Entrar"}>
            <LogIn size={24} aria-hidden="true" /><span>{loading ? "Verificando…" : busy ? "Entrando…" : "Entrar"}</span>
          </button>
          {error && <p id="biglog-login-error" role="alert" className="biglog-login__error">{error}</p>}
        </form>
        {!runningAsApp ? (
          <nav className="biglog-login__desktop-install" aria-label="Instalar BigLog">
            <a className="biglog-login__download-hotspot"
              href="/downloads/BigLogno-Windows.exe" download="BigLogno-Windows.exe"
              aria-label="Baixar BigLog para Windows">
              <span className="biglog-login__download-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 3.4 10.8 2v9.4H1zm11-1.6L23 0v11.4H12zM1 12.6h9.8V22L1 20.6zm11 0h11V24l-11-1.7z" /></svg></span>
              <span className="biglog-login__download-copy"><strong>Baixar BigLog</strong><small>para Windows</small></span>
              <Download className="biglog-login__download-action" size={23} aria-hidden="true" />
            </a>
            <button className="biglog-login__browser-hotspot" type="button"
              onClick={installWebApp} aria-label="Instalar BigLog pelo navegador">
              <MonitorDown className="biglog-login__download-icon" size={27} aria-hidden="true" />
              <span className="biglog-login__download-copy"><strong>Instalar BigLog</strong><small>pelo navegador</small></span>
              <Download className="biglog-login__download-action biglog-login__download-action--browser" size={22} aria-hidden="true" />
            </button>
          </nav>
        ) : (
          <span className="biglog-login__installed" role="status">BigLog instalado</span>
        )}
        {installHelp && <div role="status" className="biglog-login__install-help">
          No Chrome ou Edge, abra o menu (⋮ ou ···) e procure por <strong>Instalar este site como aplicativo</strong> ou <strong>Apps → Instalar</strong>. No celular, utilize <strong>Adicionar à tela inicial</strong>.
          <button type="button" onClick={() => setInstallHelp(false)} aria-label="Fechar instruções">×</button>
        </div>}
        {loading && <span className="biglog-login__checking" role="status">Verificando acesso…</span>}
      </div>

      {/* Celular e tablet: interface responsiva, sem sobrepor controles à imagem desktop. */}
      <section className="biglog-login__mobile" aria-label="Acesso ao BigLog no celular">
        <header className="biglog-login__mobile-header">
          <div className="biglog-login__mobile-brand" aria-label="BigLog — Bignotto Ferramentas">
            <img className="biglog-login__mobile-logo-mark" src="/favicon.png" alt="" width={64} height={64} />
            <div className="biglog-login__mobile-wordmark">
              <span>Big<strong>Log</strong></span>
              <small>BIGNOTTO FERRAMENTAS</small>
            </div>
          </div>
        </header>

        <div className="biglog-login__mobile-form-card">
          <div className="biglog-login__mobile-card-heading">
            <span className="biglog-login__mobile-lock" aria-hidden="true"><LockKeyhole size={23} /></span>
            <div>
              <h1>Acesse sua conta</h1>
              <p>Entre para acessar o BigLog.</p>
            </div>
          </div>
          {loading ? (
            <p className="biglog-login__mobile-loading" role="status">Verificando acesso…</p>
          ) : (
            <form onSubmit={submitLogin}>
              <label htmlFor="biglog-mobile-password">Senha de acesso</label>
              <div className="biglog-login__mobile-field">
                <input
                  id="biglog-mobile-password"
                  type={visible ? "text" : "password"}
                  value={password}
                  required
                  maxLength={256}
                  autoComplete="current-password"
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "biglog-mobile-error" : undefined}
                />
                <button type="button" onClick={() => setVisible(!visible)}
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}>
                  {visible ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
              {error && <p className="biglog-login__mobile-error" id="biglog-mobile-error" role="alert">{error}</p>}
              <button className="biglog-login__mobile-submit" type="submit" disabled={busy}>
                <LogIn size={22} aria-hidden="true" />{busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
          )}

          {!runningAsApp && (
            <section className="biglog-login__mobile-install" aria-label="Instalar BigLog">
              <h2>Use o BigLog como aplicativo</h2>
              <button className="biglog-login__mobile-install-primary" type="button" onClick={installWebApp}>
                <MonitorDown size={22} aria-hidden="true" />
                <span>Instalar pelo navegador</span>
              </button>
              <a className="biglog-login__mobile-install-secondary" href="/downloads/BigLogno-Windows.exe" download="BigLogno-Windows.exe">
                <Download size={20} aria-hidden="true" />
                <span>Baixar para Windows</span>
              </a>
              {installHelp && (
                <p role="status" className="biglog-login__mobile-help">
                  No Chrome ou Edge, abra o menu do navegador e escolha <strong>Instalar aplicativo</strong>.
                  No celular, procure também <strong>Adicionar à tela inicial</strong>.
                </p>
              )}
            </section>
          )}
        </div>

        <footer className="biglog-login__mobile-signature">
          <div className="biglog-login__mobile-signature-copy">
            <strong>BigLog</strong>
            <span>Bignotto Ferramentas</span>
            <small>Precisa de internet para acessar os dados.</small>
          </div>
          <img src="/images/biglog-mascot.avif" alt="Mascote da Bignotto" width={94} height={159} loading="lazy" />
        </footer>
      </section>
    </main>
  );
}