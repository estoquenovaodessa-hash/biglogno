import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, LogIn, Eye, EyeOff, Download, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccess, unlockAccess } from "@/lib/access.functions";
import type { AccessRole } from "@/lib/access-policy";
import logo from "@/assets/bignotto-logo.png.asset.json";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
    get().then((data) => { if (alive) setRole(data.role); }).catch(() => { if (alive) setError("Não foi possível verificar o acesso. Tente novamente."); }).finally(() => { if (alive) setLoading(false); });
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
    <main className="flex min-h-screen items-center justify-center border-t-4 border-brand-gold bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <img src={logo.url} alt="Bignotto Ferramentas" className="mx-auto mb-10 w-64 max-w-full object-contain" />
        <LockKeyhole className="mb-4 h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Gestão de Logística</h1>
        {loading ? <p className="mt-4 text-muted-foreground" role="status">Verificando acesso…</p> : (
          <form className="mt-6 space-y-5" onSubmit={async (event) => {
            event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await unlock({ data: { password } });
      if (result.role) {
        const verified = await get();
        if (verified.role) { setPassword(""); setRole(verified.role); }
        else setError("Não foi possível manter seu acesso. Permita cookies e tente entrar novamente.");
      } else setError(result.error ?? "Senha incorreta.");
    }
            catch { setError("Não foi possível entrar. Tente novamente."); }
            finally { setBusy(false); }
          }}>
            <div>
              <label htmlFor="access-password" className="mb-2 block text-sm font-semibold">Senha de acesso</label>
              <div className="relative">
                <input id="access-password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-md border border-input bg-card pl-3 pr-12 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"}>{visible ? <EyeOff /> : <Eye />}</Button>
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="h-12 w-full"><LogIn className="h-4 w-4" />{busy ? "Entrando…" : "Entrar"}</Button>
          </form>
        )}
        {!runningAsApp && (
          <section className="mt-7 space-y-3 border-t border-border pt-6" aria-label="Instalar BigLogno">
            <p className="text-center text-sm font-semibold text-foreground">Use o BigLogno como aplicativo</p>
            <Button asChild variant="outline" className="h-12 w-full">
              <a href="/downloads/BigLogno-Windows.exe" download="BigLogno-Windows.exe">
                <Download className="h-4 w-4" /> Baixar BigLogno para Windows
              </a>
            </Button>
            <Button type="button" variant="ghost" className="h-10 w-full" onClick={installWebApp}>
              <MonitorDown className="h-4 w-4" /> Instalar aplicativo pelo navegador
            </Button>
            {installHelp && (
              <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                No Chrome ou Edge, abra o menu (⋮ ou ···), procure por <strong>Instalar este site como aplicativo</strong>
                ou <strong>Apps → Instalar</strong>. No celular, utilize <strong>Adicionar à tela inicial</strong>.
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              O aplicativo abre em tela cheia e precisa de internet para acessar os dados.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}