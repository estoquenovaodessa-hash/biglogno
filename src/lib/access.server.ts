import { createHash, timingSafeEqual } from "node:crypto";
import { useSession, setResponseHeader } from "@tanstack/react-start/server";
import type { AccessRole } from "./access-policy";
import { ACCESS_COOKIE } from "./access-cookie";

export function passwordMatches(input: string, expected: string): boolean {
  return timingSafeEqual(createHash("sha256").update(input).digest(), createHash("sha256").update(expected).digest());
}

export async function accessSession() {
  const password = process.env["SESSION_SECRET"];
  if (!password) throw new Error("Acesso ainda não configurado.");
  setResponseHeader("cache-control", "no-store");
  return useSession<{ role?: AccessRole; credentialVersion?: string; employeeId?: string }>({
    password, name: "bignotto-access", maxAge: 60 * 60 * 8,
    cookie: ACCESS_COOKIE,
  });
}

export async function currentRole(): Promise<AccessRole | null> {
  const session = await accessSession();
  const role = session.data.role;
  if (role !== "gestor" && role !== "operador") return null;
  const expected = process.env[role === "gestor" ? "GESTOR_PASSWORD" : "OPERADOR_PASSWORD"];
  if (!expected || session.data.credentialVersion !== createHash("sha256").update(expected).digest("hex")) return null;
  return role;
}

export async function requireAccess() {
  const role = await currentRole();
  if (!role) throw new Error("Acesso não autorizado. Entre novamente.");
  return role;
}