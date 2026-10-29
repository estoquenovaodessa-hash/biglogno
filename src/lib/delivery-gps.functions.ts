import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gpsPeriodBounds } from "./delivery-gps";

const distanceInput = z.object({
  eventId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  sessionId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  distanceMeters: z.number().finite().min(5).max(1000),
});

/** Apenas o entregador autenticado e autorizado, durante entrega EM ROTA.
 * O banco não armazena coordenadas, somente metros percorridos por amostra.
 * Erros são exibidos apenas no status de GPS, nunca bloqueiam entregas. */
export const recordGpsDistance = createServerFn({ method: "POST" })
  .inputValidator(distanceInput)
  .handler(async ({ data }) => {
    const { requireOperatorPermission } = await import("./employees.functions");
    const employee = await requireOperatorPermission("entregas");
    if (employee.badge !== "ENTREGADOR")
      throw new Error("Somente funcionários com emblema ENTREGADOR podem registrar quilometragem.");
    const { logisticsClient } = await import("./logistics.server");
    const db = await logisticsClient();
    const { data: recorded, error } = await db.rpc("record_delivery_gps_distance", {
      p_event_id: data.eventId,
      p_employee_id: employee.id,
      p_delivery_id: data.deliveryId,
      p_session_id: data.sessionId,
      p_started_at: data.startedAt,
      p_finished_at: data.finishedAt,
      p_distance_m: data.distanceMeters,
    });
    if (error) {
      console.error("[GPS] Não foi possível registrar distância", { code: error.code, message: error.message });
      if (error.code === "PGRST202" || error.code === "42883")
        throw new Error("GPS indisponível: falta executar o SQL de quilometragem no Supabase.");
      if (error.message.includes("GPS_OPERACAO_NAO_ATIVA"))
        throw new Error("A entrega não está mais em rota para este entregador.");
      throw new Error("Não foi possível registrar a distância no Supabase.");
    }
    return { ok: recorded === true };
  });

const periodInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(["day", "week", "month"]),
});

/** Totais do gestor: incluem apenas amostras efetivamente registradas.
 * Não calcula quilometragem retroativa com base no desenho das rotas. */
export const readGpsKilometers = createServerFn({ method: "POST" })
  .inputValidator(periodInput)
  .handler(async ({ data }) => {
    const { requireAccess } = await import("./access.server");
    if (await requireAccess() !== "gestor")
      throw new Error("Somente o gestor pode consultar quilometragem dos entregadores.");
    const bounds = gpsPeriodBounds(data.date, data.period);
    const { logisticsClient } = await import("./logistics.server");
    const db = await logisticsClient();
    const { data: rows, error } = await db.rpc("delivery_gps_distance_report", {
      p_reference_date: data.date,
      p_period: data.period,
    });
    if (error) {
      console.error("[GPS] Não foi possível consultar quilometragem", { code: error.code, message: error.message });
      if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01")
        throw new Error("Relatório GPS não instalado. Execute o SQL de quilometragem no Supabase.");
      throw new Error("Não foi possível consultar o relatório de quilômetros.");
    }
    return {
      ...bounds,
      rows: (rows ?? []).map(row => ({
        employeeId: row.employee_id,
        distanceMeters: Number(row.distance_m) || 0,
        samples: Number(row.segments) || 0,
        firstAt: row.first_at,
        lastAt: row.last_at,
      })),
    };
  });
