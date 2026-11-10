import { describe, expect, test } from "bun:test";
import { assignedDriverForVehicle, canSeeInMyDeliveries, shiftFromCompletion, deliveryCompanyIdentity } from "./delivery-dispatch";

describe("atribuição da expedição", () => {
  test("moto Marcelo e carro Luciano; Cauê apenas apoio do carro", () => {
    expect(assignedDriverForVehicle("moto")).toBe("Marcelo");
    expect(assignedDriverForVehicle("carro")).toBe("Luciano");
    expect(assignedDriverForVehicle(null)).toBeNull();
    const moto = { source: "conferencia", expeditionVehicle: "moto" };
    const carro = { source: "conferencia", expeditionVehicle: "carro" };
    expect(canSeeInMyDeliveries(moto, "Marcelo")).toBe(true);
    expect(canSeeInMyDeliveries(moto, "Luciano")).toBe(false);
    expect(canSeeInMyDeliveries(carro, "Cauê")).toBe(true);
    expect(canSeeInMyDeliveries(carro, "Marcelo")).toBe(false);
    expect(canSeeInMyDeliveries({ source: "coleta", collectionTransport: "moto" }, "Marcelo")).toBe(true);
    expect(canSeeInMyDeliveries({ source: "conferencia" }, "Marcelo")).toBe(false);
  });
  test("turno pelos horários reais de conclusão (São Paulo)", () => {
    expect(shiftFromCompletion("2026-11-10T10:00:00Z")).toBe("manha"); // 07:00
    expect(shiftFromCompletion("2026-11-10T15:00:00Z")).toBe("manha"); // 12:00
    expect(shiftFromCompletion("2026-11-10T15:15:00Z")).toBe("indefinido");
    expect(shiftFromCompletion("2026-11-10T15:30:00Z")).toBe("tarde");
    expect(shiftFromCompletion("2026-11-10T20:30:00Z")).toBe("tarde");
  });
  test("identifica mesmo cliente por código, sem agrupar automaticamente", () => {
    expect(deliveryCompanyIdentity({company:"A", companyCode:"00123"})).toBe("code:123");
    expect(deliveryCompanyIdentity({company:"B", companyCode:"123"})).toBe("code:123");
  });
});
