import { expect, test } from "bun:test";
import { finishPickup, manualPickupSchema } from "./pickups";
const id = "00000000-0000-4000-8000-000000000001";
test("SBO solicita apenas retirador; NO exige documento valor e empresa", () => {
  expect(manualPickupSchema.safeParse({ source: "SBO", requestId: id, collector: "João" }).success).toBe(true);
  expect(manualPickupSchema.safeParse({ source: "SBO", requestId: id, collector: "" }).success).toBe(false);
  expect(manualPickupSchema.safeParse({ source: "NO", requestId: id, companyCode: "1" }).success).toBe(false);
  expect(manualPickupSchema.safeParse({ source: "NO", requestId: id, companyCode: "1", document: "1234", value: 27 }).success).toBe(true);
});
test("retirar exige operador e registra data hora sem permitir segunda retirada", () => {
  const p = { id, createdAt: "", company: "Empresa", source: "NO", status: "pendente" };
  const now = new Date("2026-10-22T11:25:00Z");
  expect(() => finishPickup(p, " ", now)).toThrow();
  const done = finishPickup(p, " Caíque ", now);
  expect(done.handedBy).toBe("Caíque"); expect(done.finishedAt).toBe("2026-10-22T11:25:00.000Z");
  expect(() => finishPickup(done, "Outro", now)).toThrow();
});
describe("Turno da Retira pendente",()=>{
  const base={id:"a",createdAt:"2026-11-06T12:00:00Z",source:"conferencia",status:"pendente",
    company:"BIGNOTTO",document:"00125",value:45};
  test("altera N/D para manhã e tarde preservando documento e valor",async()=>{
    const {withExpeditionPickupShift}=await import("./pickups");
    const morning=withExpeditionPickupShift(base,"manha","2026-11-06");
    expect(morning.expeditionShift).toBe("manha");
    expect(morning.document).toBe("00125");
    expect(morning.value).toBe(45);
    expect(withExpeditionPickupShift(morning,"tarde","2026-11-06").expeditionShift).toBe("tarde");
    const cleared=withExpeditionPickupShift(morning,null,"2026-11-06");
    expect(cleared.expeditionShift).toBeUndefined();
    expect(cleared.expeditionShiftDate).toBeUndefined();
  });
  test("não altera Retira já retirada ou de origem manual",async()=>{
    const {withExpeditionPickupShift}=await import("./pickups");
    expect(()=>withExpeditionPickupShift({...base,status:"finalizada"},"manha","2026-11-06")).toThrow();
    expect(()=>withExpeditionPickupShift({...base,source:"NO"},"manha","2026-11-06")).toThrow();
  });
});
