import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clientSchema } from "./sales-verification";

/** Consulta limitada ao gestor: o cadastro de clientes define qual código
 * identifica a loja; endereço e coordenadas são lidos do cadastro de endereços. */
export const readBignottoOriginClients = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAccess } = await import("./access.server");
  if (await requireAccess() !== "gestor") throw new Error("A origem das rotas é exclusiva do gestor.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_state")
    .select("value").eq("key", "sales-clients").maybeSingle();
  if (error) throw new Error("Não foi possível identificar a loja no cadastro.");
  const clients = z.array(clientSchema).parse(data?.value ?? []);
  // Não transfere a base inteira de clientes ao navegador.
  return clients.filter(client => {
    const name = client.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return name.includes("BIGNOTTO") && name.includes("FERRAMENTAS");
  }).map(client => ({ code: client.code, name: client.name }));
});
