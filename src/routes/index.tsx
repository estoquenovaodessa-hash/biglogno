import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  FileInput,
  ChartNoAxesCombined,
  PackageSearch,
  ScanLine,
  Warehouse,
  LocateFixed,
  CalendarClock,
  Upload,
  Package,
  BarChart3,
  Route as RouteIcon,
  ShieldCheck,
  History,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Monitor,
  Smartphone,
  ClipboardCheck,
  LogOut,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useStore, StoreProvider } from "@/lib/store";
import { AccessGate } from "@/components/AccessGate";
import { canAccessTab, type AccessRole } from "@/lib/access-policy";
import { lockAccess } from "@/lib/access.functions";
import { useServerFn } from "@tanstack/react-start";
import { SalesVerification } from "@/components/SalesVerification";
import { useQueryClient } from "@tanstack/react-query";
import { UploadPanel } from "@/components/UploadPanel";
import { Estoque } from "@/components/Estoque";
import { AnalisesOperacoes } from "@/components/AnalisesOperacoes";
import { Roteiro } from "@/components/Roteiro";
import { ZonaSegura } from "@/components/ZonaSegura";
import { FuroEstoqueNotifier } from "@/components/FuroEstoque";
import { Historico } from "@/components/Historico";
import { Enderecamento } from "@/components/Enderecamento";
import { Entregas } from "@/components/Entregas";
import { CiclosContagem } from "@/components/CiclosContagem";
import { cn } from "@/lib/utils";
import logo from "@/assets/bignotto-logo.png.asset.json";
import symbol from "@/assets/bignotto-symbol.png.asset.json";

export const Route = createFileRoute("/")({
  // Painel privado: a renderização da interface ocorre no navegador.
  // Evita gastar CPU no Worker com SSR da tela de logística.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gestão de Logística — Bignotto Ferramentas" },
      {
        name: "description",
        content:
          "Painel logístico operacional de fluxo físico de materiais da Bignotto Ferramentas.",
      },
      { property: "og:title", content: "Gestão de Logística — Bignotto Ferramentas" },
      {
        property: "og:description",
        content:
          "Painel logístico operacional de fluxo físico de materiais da Bignotto Ferramentas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

const TABS = [
  { key: "Importação", icon: FileInput },
  { key: "Análises e Operações", icon: ChartNoAxesCombined },
  { key: "Contagem", icon: ScanLine },
  { key: "Conferência", icon: ClipboardCheck },
  { key: "Entregas", icon: Truck },
  { key: "Roteiro de Apuração", icon: RouteIcon },
  { key: "Zona Segura", icon: ShieldCheck },
  { key: "Estoque", icon: Warehouse },
  { key: "Endereçamento", icon: LocateFixed },
  { key: "Histórico", icon: CalendarClock },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type ViewMode = "mobile" | "desktop";

const VIEW_MODE_KEY = "monitor-abc-view-mode";

function App() {
  return <AccessGate>{(role, onExit) => <StoreProvider key={role}><OperationalApp role={role} onExit={onExit} /></StoreProvider>}</AccessGate>;
}

function OperationalApp({ role, onExit }: { role: AccessRole; onExit: () => void }) {
  const queryClient = useQueryClient();
  const lock = useServerFn(lockAccess);
  const [operatorScreen, setOperatorScreen] = useState<"Contagem" | "Conferência" | "Entregas" | null>(null);
  const [exiting, setExiting] = useState(false);
  const handleExit = async () => {
    setExiting(true);
    try {
      await queryClient.cancelQueries();
      await lock();
      queryClient.clear();
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("monitor-abc-bignotto:") && !key.endsWith(":theme")) localStorage.removeItem(key);
      }
      onExit();
    } finally { setExiting(false); }
  };
  const { theme, toggleTheme, items, ready } = useStore();
  const [tab, setTab] = useState<TabKey>(role === "gestor" ? "Importação" : "Contagem");
  const [aberto, setAberto] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");

  useEffect(() => {
    const savedMode = window.localStorage.getItem(VIEW_MODE_KEY);
    if (savedMode === "mobile" || savedMode === "desktop") {
      setViewMode(savedMode);
      return;
    }
    setViewMode(window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop");
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const renderTab = () => {
    if (!canAccessTab(role, tab)) return null;
    switch (tab) {
      case "Importação":
        return <UploadPanel />;
      case "Análises e Operações":
        return <AnalisesOperacoes />;
      case "Conferência":
        return <SalesVerification role={role} />;
      case "Entregas":
        return <Entregas role={role} />;
      case "Contagem":
        return <CiclosContagem />;
      case "Roteiro de Apuração":
        return <Roteiro />;
      case "Zona Segura":
        return <ZonaSegura />;
      case "Estoque":
        return <Estoque />;
      case "Endereçamento":
        return <Enderecamento />;
      case "Histórico":
        return <Historico />;
    }
  };

  const needsImport = ![
    "Importação",
    "Contagem",
    "Conferência",
    "Entregas",
    "Zona Segura",
    "Estoque",
    "Histórico",
  ].includes(tab);

  const activeTab = TABS.find((item) => item.key === tab);
  const ActiveIcon = activeTab?.icon ?? PackageSearch;

  const navigation = (closeOnSelect = false) => (
    <nav className="brand-nav flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
      {TABS.filter(({ key }) => canAccessTab(role, key)).map(({ key, icon: Icon }) => {
        const isActive = tab === key;
        const item = (
          <Button
            variant="ghost"
            onClick={() => setTab(key)}
            title={key}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "h-auto min-h-12 w-full gap-3 rounded-md px-3 py-3 text-sm font-semibold whitespace-normal",
              aberto || closeOnSelect ? "justify-start" : "justify-center",
              isActive
                ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {(aberto || closeOnSelect) && <span className="text-left leading-tight">{key}</span>}
          </Button>
        );

        return closeOnSelect ? (
          <SheetClose asChild key={key}>
            {item}
          </SheetClose>
        ) : (
          <div key={key}>{item}</div>
        );
      })}
    </nav>
  );

  const content = ready && needsImport && items.length === 0 ? (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:p-10">
      Nenhum relatório importado. Vá até a aba <strong>Importação</strong> para carregar o CSV de movimentação.
    </div>
  ) : (
    renderTab()
  );

  const brandHeader = (
    <div className="flex min-h-28 items-center justify-center border-b border-sidebar-border bg-card px-4 py-3">
      <img src={logo.url} alt="Bignotto Ferramentas" className="brand-logo" />
    </div>
  );

  const pageHeading = (
    <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
        <ActiveIcon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gestão de Logística</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">{tab}</h1>
      </div>
    </div>
  );

  if (role === "operador") {
    return <div className={cn("min-h-screen overflow-x-hidden bg-background", viewMode === "mobile" && "mobile-view")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-brand-gold bg-card px-4 py-3">
        <img src={logo.url} alt="Bignotto Ferramentas" className="h-14 w-40 object-contain" />
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">{theme === "dark" ? <Sun /> : <Moon />}</Button><Button variant="outline" disabled={exiting} onClick={handleExit}><LogOut className="h-4 w-4" />Sair</Button></div>
      </header>
      <main className="logistics-content mx-auto max-w-[1600px] px-4 py-6 sm:px-8">
        {!operatorScreen ? <div className="mx-auto max-w-2xl py-10"><h1 className="mb-8 text-center text-2xl font-bold">Gestão de Logística</h1><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Button variant="outline" className="h-40 flex-col gap-4 border-t-4 border-t-primary bg-card text-xl font-bold" onClick={() => setOperatorScreen("Contagem")}><ScanLine className="h-10 w-10 text-primary" />CONTAGEM</Button>
          <Button variant="outline" className="h-40 flex-col gap-4 border-t-4 border-t-brand-gold bg-card text-xl font-bold" onClick={() => setOperatorScreen("Conferência")}><ClipboardCheck className="h-10 w-10 text-primary" />CONFERENCIA</Button>
          <Button variant="outline" className="h-40 flex-col gap-4 border-t-4 border-t-primary bg-card text-xl font-bold" onClick={() => setOperatorScreen("Entregas")}><Truck className="h-10 w-10 text-primary" />ENTREGAS</Button>
        </div></div> : <><Button variant="ghost" className="mb-5" onClick={() => setOperatorScreen(null)}>← Voltar</Button>{operatorScreen === "Contagem" ? <><h1 className="mb-6 text-2xl font-bold">Contagem</h1><CiclosContagem /></> : operatorScreen === "Entregas" ? <Entregas role={role} /> : <SalesVerification role={role} />}</>}
      </main>
    </div>;
  }

  if (viewMode === "mobile") {
    return (
      <div className="mobile-view min-h-screen overflow-x-hidden bg-background">
        {role === "gestor" && <FuroEstoqueNotifier />}
        <header className="sticky top-0 z-40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b-4 border-brand-gold bg-card px-3 py-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[min(88vw,320px)] flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="sr-only">Gestão de Logística Bignotto</SheetTitle>
                <SheetDescription className="sr-only">Navegação principal</SheetDescription>
                {brandHeader}
              </SheetHeader>
              <p className="px-6 pb-3 pt-5 text-xs font-bold uppercase tracking-wide text-sidebar-foreground/60">Operação logística</p>
              <div className="flex min-h-0 flex-1 flex-col">{navigation(true)}</div>
              <div className="grid grid-cols-2 gap-2 border-t border-sidebar-border p-3">
                <SheetClose asChild>
                  <Button variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => changeViewMode("desktop")}><Monitor className="h-4 w-4" /> PC</Button>
                </SheetClose>
                <Button variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />} Tema</Button>
              </div>
            </SheetContent>
          </Sheet>
          <img src={logo.url} alt="Bignotto Ferramentas" className="mx-auto h-12 w-36 object-contain" />
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">{theme === "dark" ? <Sun /> : <Moon />}</Button>
        </header>
        <main className="logistics-content min-w-0 px-3 py-5">
          <div className="mb-4 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-muted-foreground">{role === "gestor" ? "Gestor" : "Operador"}</span><Button variant="outline" onClick={handleExit} disabled={exiting}><LogOut className="h-4 w-4" /> Sair</Button></div>
          {pageHeading}
          <div className="mx-auto max-w-[1600px]">{content}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {role === "gestor" && <FuroEstoqueNotifier />}
      <aside className={cn("sticky top-0 z-20 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-all duration-300", aberto ? "w-64" : "w-[76px]")}>
        {aberto ? brandHeader : <div className="flex h-28 items-center justify-center border-b border-sidebar-border"><img src={symbol.url} alt="Bignotto" className="h-12 w-12" /></div>}
        {aberto && <p className="px-6 pb-3 pt-6 text-xs font-bold uppercase tracking-wide text-sidebar-foreground/60">Operação logística</p>}
        <div className={cn("flex min-h-0 flex-1 flex-col", !aberto && "pt-5")}>{navigation()}</div>
        {aberto && <div className="mx-6 mb-5 border-t border-sidebar-border pt-4 text-xs text-sidebar-foreground/70"><p className="font-bold text-sidebar-foreground">Bignotto Ferramentas</p><p>Gestão de Logística</p></div>}
        <div className={cn("grid gap-2 border-t border-sidebar-border p-3", aberto ? "grid-cols-3" : "grid-cols-1 justify-items-center")}>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => setAberto((v) => !v)} aria-label={aberto ? "Esconder menu" : "Mostrar menu"} title={aberto ? "Esconder menu" : "Mostrar menu"}>{aberto ? <PanelLeftClose /> : <PanelLeftOpen />}</Button>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema">{theme === "dark" ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => changeViewMode("mobile")} aria-label="Usar visualização mobile" title="Visualização mobile"><Smartphone /></Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b-4 border-brand-gold bg-card px-6 py-4">
          <div className="flex items-center gap-3"><img src={symbol.url} alt="" className="h-9 w-9 rounded-md" /><span className="text-xl font-bold text-primary">Gestão de Logística</span></div>
          <div className="flex items-center gap-3"><span className="text-sm font-semibold text-muted-foreground">{role === "gestor" ? "Gestor" : "Operador"}</span><Button variant="outline" onClick={handleExit} disabled={exiting}><LogOut className="h-4 w-4" /> Sair</Button></div>
        </header>
        <main className="logistics-content min-w-0 px-5 py-6 lg:px-8">
          <div className="mx-auto max-w-[1600px]">{pageHeading}{content}</div>
        </main>
      </div>
    </div>
  );
}
