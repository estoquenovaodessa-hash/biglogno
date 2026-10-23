import { test, expect } from "bun:test";
import { ACCESS_COOKIE } from "./access-cookie";

test("acesso permanece no contexto incorporado sem expor a sessão", () => {
  expect(ACCESS_COOKIE.sameSite).toBe("none");
  expect(ACCESS_COOKIE.partitioned).toBe(true);
  expect(ACCESS_COOKIE.secure).toBe(true);
  expect(ACCESS_COOKIE.httpOnly).toBe(true);
});