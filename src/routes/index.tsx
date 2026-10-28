import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  PackageCheck,
  BarChart3,
  ChartColumnIncreasing,
  UsersRound,
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
  MessageCircle,
  ArrowLeft,
  UserRound,
  LogOut,
  Truck,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { EmployeeGate, EmployeeTag, useActiveEmployee } from "@/components/EmployeeGate";
import { useOperatorRights } from "@/components/useOperatorRights";
import { FriendlyPingBridge } from "@/components/FriendlyPingBridge";
import { CadastroFuncionarios } from "@/components/CadastroFuncionarios";
import { canAccessTab, type AccessRole } from "@/lib/access-policy";
import { lockAccess } from "@/lib/access.functions";
import { useServerFn } from "@tanstack/react-start";
import { SalesVerification } from "@/components/SalesVerification";
import { useQueryClient } from "@tanstack/react-query";
import { UploadPanel } from "@/components/UploadPanel";
import { AnalisesOperacoes } from "@/components/AnalisesOperacoes";
import { Roteiro } from "@/components/Roteiro";
import { ZonaSegura } from "@/components/ZonaSegura";
import { FuroEstoqueNotifier } from "@/components/FuroEstoque";
import { Historico } from "@/components/Historico";
import { Enderecamento } from "@/components/Enderecamento";
import { Entregas } from "@/components/Entregas";
import { ExpedicaoOperador } from "@/components/ExpedicaoOperador";
import { CiclosContagem } from "@/components/CiclosContagem";
import { ApuracaoGeral } from "@/components/ApuracaoGeral";
import { ChatOcorrencias } from "@/components/ChatOcorrencias";
import { cn } from "@/lib/utils";
import logo from "@/assets/bignotto-logo.png.asset.json";
import symbol from "@/assets/bignotto-symbol.png.asset.json";

export const Route = createFileRoute("/")({
  // Painel privado: carregamento da interface no navegador (reduz CPU do Worker).
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

// Somente as páginas realmente navegáveis. "Estoque" é exclusivamente um grupo de menu.
const TABS = [
  { key: "Importação", icon: FileInput },
  { key: "Análises e Operações", icon: ChartNoAxesCombined },
  { key: "Roteiro de Apuração", icon: RouteIcon },
  { key: "Zona Segura", icon: ShieldCheck },
  { key: "Endereçamento", icon: LocateFixed },
  { key: "Histórico", icon: CalendarClock },
  { key: "Contagem", icon: ScanLine },
  { key: "Conferência", icon: ClipboardCheck },
  { key: "Expedição", icon: PackageCheck },
  { key: "Entregas", icon: Truck },
  { key: "Apuração Geral", icon: ChartColumnIncreasing },
  { key: "Cadastro de Funcionários", icon: UsersRound },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Seis páginas sob Estoque e seis opções principais, nesta ordem.
const ESTOQUE_SUBTABS = TABS.slice(0, 6);
const MENU_PRINCIPAL = TABS.slice(6);
type ViewMode = "mobile" | "desktop";

const VIEW_MODE_KEY = "monitor-abc-view-mode";

function App() {
  return <AccessGate>{(role, onExit) => <EmployeeGate role={role} onExit={onExit}><StoreProvider key={role}><OperationalApp role={role} onExit={onExit} /></StoreProvider></EmployeeGate>}</AccessGate>;
}

function OperationalApp({ role, onExit }: { role: AccessRole; onExit: () => void }) {
  const queryClient = useQueryClient();
  const lock = useServerFn(lockAccess);
  const [operatorScreen, setOperatorScreen] = useState<"Contagem" | "Conferência" | "Entregas" | "Expedição" | "Chat" | null>(null);
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
  const { employee, switchProfile } = useActiveEmployee();
  const rights = useOperatorRights();
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
      case "Expedição":
        return role === "gestor" ? <ExpedicaoOperador readOnly /> : null;
      case "Entregas":
        return <Entregas role={role} />;
      case "Apuração Geral":
        return role === "gestor" ? <ApuracaoGeral /> : null;
      case "Cadastro de Funcionários":
        return role === "gestor" ? <CadastroFuncionarios /> : null;
      case "Contagem":
        return <CiclosContagem canOperate={role !== "operador" || rights.contagem} />;
      case "Roteiro de Apuração":
        return <Roteiro />;
      case "Zona Segura":
        return <ZonaSegura />;
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
    "Expedição",
    "Entregas",
    "Apuração Geral",
    "Cadastro de Funcionários",
    "Zona Segura",
    "Histórico",
  ].includes(tab);

  const activeTab = TABS.find((item) => item.key === tab);
  const ActiveIcon = activeTab?.icon ?? PackageSearch;

  const estoqueAtivo = ESTOQUE_SUBTABS.some(({ key }) => tab === key);
  const [estoqueMenuAberto, setEstoqueMenuAberto] = useState(false);
  const fecharEstoqueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pequena tolerância permite mover o ponteiro entre o ícone e o menu flutuante.
  const abrirEstoque = () => {
    if (fecharEstoqueTimer.current) clearTimeout(fecharEstoqueTimer.current);
    fecharEstoqueTimer.current = null;
    setEstoqueMenuAberto(true);
  };
  const agendarFecharEstoque = () => {
    if (fecharEstoqueTimer.current) clearTimeout(fecharEstoqueTimer.current);
    fecharEstoqueTimer.current = setTimeout(() => setEstoqueMenuAberto(false), 170);
  };

  useEffect(() => () => {
    if (fecharEstoqueTimer.current) clearTimeout(fecharEstoqueTimer.current);
  }, []);

  const selecionarPagina = (key: TabKey) => {
    setTab(key);
    setEstoqueMenuAberto(false);
  };

  const navigation = (closeOnSelect = false) => {
    const mostrarRotulo = aberto || closeOnSelect;
    const menuCompacto = !mostrarRotulo;
    const opcoesEstoque = ESTOQUE_SUBTABS.filter(({ key }) => canAccessTab(role, key));
    const idSubmenu = closeOnSelect ? "estoque-submenu-mobile" : "estoque-submenu-desktop";

    const renderOption = ({ key, icon: Icon }: (typeof TABS)[number], filha = false) => {
      const isActive = tab === key;
      const item = (
        <Button
          variant="ghost"
          onClick={() => selecionarPagina(key)}
          title={key}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "h-auto w-full gap-3 rounded-md text-sm font-semibold whitespace-normal",
            filha ? "min-h-10 px-3 py-2.5" : "min-h-12 px-3 py-3",
            mostrarRotulo || filha ? "justify-start" : "justify-center",
            isActive
              ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {(mostrarRotulo || filha) && <span className="text-left leading-tight">{key}</span>}
        </Button>
      );

      return closeOnSelect ? <SheetClose key={key} asChild>{item}</SheetClose> : <div key={key}>{item}</div>;
    };

    const estoqueBotao = (
      <Button
        variant="ghost"
        type="button"
        title="Estoque — mostrar subopções"
        aria-label={menuCompacto ? "Estoque — mostrar subopções" : undefined}
        aria-expanded={estoqueMenuAberto}
        aria-controls={idSubmenu}
        onClick={menuCompacto ? undefined : () => setEstoqueMenuAberto((v) => !v)}
        className={cn(
          "h-auto min-h-12 w-full gap-3 rounded-md px-3 py-3 text-sm font-semibold whitespace-normal",
          mostrarRotulo ? "justify-start" : "justify-center",
          estoqueAtivo
            ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Warehouse className="h-4 w-4 shrink-0" />
        {mostrarRotulo && <>
          <span className="flex-1 text-left leading-tight">Estoque</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", estoqueMenuAberto && "rotate-180")} />
        </>}
      </Button>
    );

    return (
      <nav aria-label="Navegação principal" className="brand-nav flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {opcoesEstoque.length > 0 && (menuCompacto ? (
          <Popover open={estoqueMenuAberto} onOpenChange={setEstoqueMenuAberto}>
            <div onPointerEnter={(event) => { if (event.pointerType === "mouse") abrirEstoque(); }}
               onPointerLeave={(event) => { if (event.pointerType === "mouse") agendarFecharEstoque(); }}>
              <PopoverTrigger asChild>{estoqueBotao}</PopoverTrigger>
            </div>
            <PopoverContent
              id={idSubmenu}
              side="right"
              align="start"
              sideOffset={6}
              className="w-64 space-y-1 border-sidebar-border bg-sidebar p-2 text-sidebar-foreground"
              onPointerEnter={(event) => { if (event.pointerType === "mouse") abrirEstoque(); }}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") agendarFecharEstoque(); }}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-sidebar-foreground/70">Estoque</p>
              {opcoesEstoque.map((entry) => renderOption(entry, true))}
            </PopoverContent>
          </Popover>
        ) : (
          <div onPointerEnter={(event) => { if (event.pointerType === "mouse") abrirEstoque(); }}
               onPointerLeave={(event) => { if (event.pointerType === "mouse") agendarFecharEstoque(); }}>
            {estoqueBotao}
            {estoqueMenuAberto && (
              <div id={idSubmenu} className="ml-5 mt-1 space-y-0.5 border-l-2 border-sidebar-border pl-2">
                {opcoesEstoque.map((entry) => renderOption(entry, true))}
              </div>
            )}
          </div>
        ))}
        {MENU_PRINCIPAL.filter(({ key }) => canAccessTab(role, key)).map((entry) => renderOption(entry))}
      </nav>
    );
  };

  const content = ready && needsImport && items.length === 0 ? (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:p-10">
      Nenhum relatório importado. Vá até a aba <strong>Importação</strong> para carregar o CSV de movimentação.
    </div>
  ) : (
    renderTab()
  );

  
const brandHeader = (
  <div className="flex min-h-28 items-center justify-center border-b border-sidebar-border bg-sidebar px-4 py-3">
    <img
      src={logo.url}
      alt="Bignotto Ferramentas"
      className="brand-logo"
    />
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
    // O Chat é um mensageiro em tela cheia: nenhum cabeçalho ou menu do painel.
    if (operatorScreen === "Chat") {
      return <div className="fixed inset-0 z-50 flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#10243a]">
        <FriendlyPingBridge role={role} currentArea={operatorScreen} />
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#355b81] bg-[#13334f] px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 text-white sm:px-5">
          <Button variant="ghost" className="h-11 gap-2 rounded-xl px-3 text-sm font-bold text-white hover:bg-white/10 hover:text-white"
            onClick={() => setOperatorScreen(null)}>
            <ArrowLeft className="h-5 w-5" /> Voltar
          </Button>
          <Button variant="outline" className="h-11 gap-2 rounded-xl border-[#6a93b2] bg-[#244c70] px-3 text-sm font-bold text-white hover:bg-[#315f87] hover:text-white"
            onClick={() => { void switchProfile(); }}>
            <UserRound className="h-4 w-4" /> Trocar de perfil
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <ChatOcorrencias />
        </main>
      </div>;
    }
    return <div className={cn("min-h-screen overflow-x-hidden bg-background", operatorScreen !== "Contagem" && viewMode === "mobile" && "mobile-view")}>
      <FriendlyPingBridge role={role} currentArea={operatorScreen} />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-4 border-brand-gold bg-card px-2 py-3 sm:gap-3 sm:px-4">
        <img src={logo.url} alt="Bignotto Ferramentas" className="h-12 w-12 object-contain sm:h-14 sm:w-40" />
        <div className="flex items-center gap-2"><EmployeeTag /><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">{theme === "dark" ? <Sun /> : <Moon />}</Button><Button variant="outline" disabled={exiting} onClick={handleExit}><LogOut className="h-4 w-4" />Sair</Button></div>
      </header>
      <main className={operatorScreen === "Contagem" ? "logistics-content mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8" : "logistics-content mx-auto max-w-[1600px] px-4 py-6 sm:px-8"}>
        {!operatorScreen ? (
          <section className="mx-auto w-full max-w-3xl py-6 sm:py-10" aria-label="Boas-vindas ao operador">
            <div className="mb-7 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card px-5 py-7 text-center shadow-sm sm:px-8 sm:py-9">
              <span aria-hidden="true" className="mb-3 inline-block text-4xl sm:text-5xl">👋</span>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                Boas-vindas, {employee?.name.split(/\s+/)[0] ?? "operador"}!
              </h1>
              <p className="mt-3 text-base font-medium text-muted-foreground sm:text-lg">
                Pronto para mais uma missão? 🚀
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha uma atividade abaixo para começar.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Escolha uma atividade">
              <Button variant="outline"
                className="group h-auto min-h-44 flex-col justify-center gap-3 whitespace-normal rounded-2xl border border-primary/35 border-t-4 border-t-primary bg-card px-4 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setOperatorScreen("Contagem")}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/20">
                  <ScanLine aria-hidden="true" className="h-8 w-8" />
                </span>
                <span className="text-lg font-extrabold text-foreground">Contagem</span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">Organize e confira o estoque</span>
              </Button>
              <Button variant="outline"
                className="group h-auto min-h-44 flex-col justify-center gap-3 whitespace-normal rounded-2xl border border-brand-gold/50 border-t-4 border-t-brand-gold bg-card px-4 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:bg-brand-gold/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-gold"
                onClick={() => setOperatorScreen("Conferência")}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold transition-colors group-hover:bg-brand-gold/20">
                  <ClipboardCheck aria-hidden="true" className="h-8 w-8" />
                </span>
                <span className="text-lg font-extrabold text-foreground">Conferência</span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">Verifique os pedidos com atenção</span>
              </Button>
              <Button variant="outline"
                className="group h-auto min-h-44 flex-col justify-center gap-3 whitespace-normal rounded-2xl border border-primary/35 border-t-4 border-t-primary bg-card px-4 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setOperatorScreen("Entregas")}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/20">
                  <Truck aria-hidden="true" className="h-8 w-8" />
                </span>
                <span className="text-lg font-extrabold text-foreground">Entregas</span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">Acompanhe suas entregas</span>
              </Button>
              <Button variant="outline"
                className="group h-auto min-h-44 flex-col justify-center gap-3 whitespace-normal rounded-2xl border border-indigo-500/35 border-t-4 border-t-indigo-500 bg-card px-4 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-indigo-500/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500"
                onClick={() => setOperatorScreen("Expedição")}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-500 transition-colors group-hover:bg-indigo-500/20">
                  <PackageCheck aria-hidden="true" className="h-8 w-8" />
                </span>
                <span className="text-lg font-extrabold text-foreground">Expedição</span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">Controle de separação, entregas e retiras</span>
              </Button>
              <Button variant="outline"
                className="group h-auto min-h-44 flex-col justify-center gap-3 whitespace-normal rounded-2xl border border-emerald-500/35 border-t-4 border-t-emerald-500 bg-card px-4 py-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500 hover:bg-emerald-500/10 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={() => setOperatorScreen("Chat")}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 transition-colors group-hover:bg-emerald-500/20">
                  <MessageCircle aria-hidden="true" className="h-8 w-8" />
                </span>
                <span className="text-lg font-extrabold text-foreground">Chat 💬</span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">Comunique ocorrências e ajude a resolver</span>
              </Button>
            </div>
            <p className="mt-6 text-center text-sm font-semibold text-muted-foreground">Cada tarefa faz a diferença. Vamos nessa! 💪</p>
          </section>
        ) : <>
          {operatorScreen === "Entregas" ? (
            <div className="mx-auto mb-5 grid w-full max-w-[560px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <Button variant="ghost" className="justify-self-start px-2 text-sm sm:px-3" onClick={() => setOperatorScreen(null)}>← Voltar</Button>
              <h1 className="flex items-center justify-center gap-2 text-center text-xl font-extrabold text-foreground sm:text-2xl">
                <Truck className="h-6 w-6 shrink-0 text-[#6faaff]" /> Entregas
              </h1>
              <span aria-hidden="true" />
            </div>
          ) : (
            <Button variant="ghost" className="mb-5" onClick={() => setOperatorScreen(null)}>← Voltar</Button>
          )}
          {operatorScreen === "Contagem" ? <section className="operator-counting"><h1 className="mb-5 text-xl font-extrabold sm:mb-6 sm:text-2xl">Contagem</h1><CiclosContagem canOperate={rights.contagem} /></section> : operatorScreen === "Entregas" ? <Entregas role={role} /> : operatorScreen === "Expedição" ? <ExpedicaoOperador /> : operatorScreen === "Chat" ? <ChatOcorrencias /> : <SalesVerification role={role} />}
        </>}
      </main>
    </div>;
  }

  if (viewMode === "mobile") {
    return (
      <div className="mobile-view min-h-screen overflow-x-hidden bg-background">
        {role === "gestor" && <FriendlyPingBridge role={role} currentArea={tab} />}
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><EmployeeTag /><Button variant="outline" onClick={handleExit} disabled={exiting}><LogOut className="h-4 w-4" /> Sair</Button></div>
          {pageHeading}
          <div className="mx-auto max-w-[1600px]">{content}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {role === "gestor" && <FriendlyPingBridge role={role} currentArea={tab} />}
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
          <div className="flex flex-wrap items-center gap-3"><EmployeeTag /><Button variant="outline" onClick={handleExit} disabled={exiting}><LogOut className="h-4 w-4" /> Sair</Button></div>
        </header>
        <main className="logistics-content min-w-0 px-5 py-6 lg:px-8">
          <div className="mx-auto max-w-[1600px]">{pageHeading}{content}</div>
        </main>
      </div>
    </div>
  );
}
