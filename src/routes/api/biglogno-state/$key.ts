import { createFileRoute } from "@tanstack/react-router";
import { canAccessState } from "@/lib/access-policy";

// Encaminha o JSON diretamente do Supabase ao navegador, como um stream.
// O Worker não faz JSON.parse/JSON.stringify de documentos de 1 MB ou mais.
// Esta rota é privada: a sessão é verificada A CADA leitura.
export const Route = createFileRoute("/api/biglogno-state/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireAccess } = await import("@/lib/access.server");
          const role = await requireAccess();
          const key = params.key;
          if (!canAccessState(role, key)) {
            return new Response("Sem permissão", { status: 403, headers: { "cache-control": "no-store" } });
          }

          const baseUrl = process.env.SUPABASE_URL;
          const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!baseUrl || !apiKey) {
            return new Response("Conexão indisponível", { status: 503, headers: { "cache-control": "no-store" } });
          }

          const url = new URL("/rest/v1/app_state", baseUrl);
          url.searchParams.set("select", "value");
          url.searchParams.set("key", `eq.${key}`);
          url.searchParams.set("limit", "1");

          const headers = new Headers({
            apikey: apiKey,
            Accept: "application/json",
          });
          // A chave sb_secret_ é opaca: NÃO usá-la como Bearer JWT.
          if (!apiKey.startsWith("sb_secret_") && !apiKey.startsWith("sb_publishable_")) {
            headers.set("Authorization", `Bearer ${apiKey}`);
          }
          const upstream = await fetch(url, { headers, cache: "no-store" });
          if (!upstream.ok || !upstream.body) {
            return new Response("Erro ao obter dados do Supabase", {
              status: 502,
              headers: { "cache-control": "no-store" },
            });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return new Response("Não autorizado ou conexão indisponível", {
            status: 401,
            headers: { "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
