import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canAccessState } from "./access-policy";

export const getAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { currentRole } = await import("./access.server");
  return { role: await currentRole() };
});

export const unlockAccess = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const { accessSession, passwordMatches } = await import("./access.server");
    const { createHash } = await import("node:crypto");
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const session = await accessSession();
    const gestor = process.env["GESTOR_PASSWORD"];
    const operador = process.env["OPERADOR_PASSWORD"];
    if (!gestor || !operador || gestor === operador) return { role: null, error: "As duas senhas de acesso precisam ser configuradas e diferentes." };
    const fingerprint = createHash("sha256").update(`${process.env["SESSION_SECRET"]}:${getRequestIP({ xForwardedFor: true }) ?? "unknown"}`).digest("hex");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("allow_access_attempt", { fingerprint });
    if (limitError) throw new Error("Não foi possível validar o acesso.");
    if (!allowed) return { role: null, error: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." };
    const managerMatch = passwordMatches(data.password, gestor);
    const operatorMatch = passwordMatches(data.password, operador);
    const role = managerMatch ? "gestor" as const : operatorMatch ? "operador" as const : null;
    if (!role) return { role: null, error: "Senha incorreta." };
    await session.update({ role, credentialVersion: createHash("sha256").update(role === "gestor" ? gestor : operador).digest("hex"), employeeId: undefined });
    return { role, error: null };
  });

export const lockAccess = createServerFn({ method: "POST" }).handler(async () => {
  const { accessSession } = await import("./access.server");
  await (await accessSession()).clear();
  return { ok: true };
});

export const readProtectedState = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keys = ["endereco-base", "import-history", "current-movimentos", "current-meta", "zona-segura", "resolvidos-dia", "conferencia", "barcodes-base", "contagem-atual", "ciclos-contagem"].filter((key) => canAccessState(role, key));
  const { data, error } = await supabaseAdmin.from("app_state").select("key,value").in("key", keys);
  if (error) throw new Error("Não foi possível carregar os dados.");
  return data ?? [];
});

export const writeProtectedState = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string(), value: z.unknown() }))
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    const role = await requireAccess();
    if (!canAccessState(role, data.key, true)) throw new Error("Sem permissão para alterar esses dados.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_state").upsert({ key: data.key, value: data.value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("Não foi possível salvar os dados.");
    return { ok: true };
  });

// Metadados leves: o navegador descobre quais valores mudaram sem transferir
// os documentos JSON grandes a cada sincronização.
export const readProtectedStateVersions = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  const role = await requireAccess();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keys = ["endereco-base", "import-history", "current-movimentos", "current-meta", "zona-segura", "resolvidos-dia", "conferencia", "barcodes-base", "contagem-atual", "ciclos-contagem"].filter((key) => canAccessState(role, key));
  const { data, error } = await supabaseAdmin.from("app_state").select("key,updated_at").in("key", keys);
  if (error) throw new Error("Não foi possível verificar atualizações dos dados.");
  return data ?? [];
});
