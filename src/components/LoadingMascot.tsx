import {Button} from "@/components/ui/button";
import "./loading-mascot.css";

type LoadingMascotProps={
  error:boolean;
  onRetry:()=>void;
  onReload:()=>void;
};

/** Tela de carregamento de dados do BigLogno: mascote original em corrida.
 * As palavras ficam em HTML para "Camarada!" permanecer azul nítido,
 * inclusive em celulares e telas de alta resolução.
 */
export function LoadingMascot({error,onRetry,onReload}:LoadingMascotProps){
  return <main className="biglogno-loading flex min-h-screen items-center justify-center px-4 py-8"
    aria-label="Carregamento do BigLogno">
    <div className="flex w-full max-w-[540px] flex-col items-center text-center">
      <div className="biglogno-loading-character" aria-hidden="true">
        <img src="/images/camarada-correndo.webp"
          alt="" width={240} height={300}
          className="h-auto w-full select-none" draggable={false}
          decoding="async" fetchPriority="high"/>
      </div>
      {error?<>
        <h1 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
          Não foi possível carregar os dados.
        </h1>
        <p role="alert" className="mt-3 max-w-md text-sm leading-relaxed text-sky-100">
          Suas informações salvas foram preservadas. Tente novamente ou entre com sua senha.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={onRetry}
            className="bg-sky-500 font-bold text-slate-950 hover:bg-sky-400">
            Tentar novamente
          </Button>
          <Button type="button" onClick={onReload}
            variant="outline" className="border-sky-400/60 bg-[#102b48] text-white hover:bg-[#1a466b] hover:text-white">
            Entrar novamente
          </Button>
        </div>
      </>:<>
        <h1 className="biglogno-loading-title mt-0 text-2xl font-black tracking-tight text-white sm:text-[31px]">
          Aguenta aí <span className="biglogno-loading-blue">Camarada!</span>
        </h1>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-[#c6d3e1] sm:text-base">
          Carregando suas informações
          <span className="biglogno-loading-dots" aria-hidden="true">...</span>
        </p>
        <span className="sr-only">Carregando suas informações salvas.</span>
      </>}
    </div>
  </main>;
}
