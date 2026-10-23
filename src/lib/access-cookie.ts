// Partitioned cookies preserve server-verified access inside the embedded preview.
export const ACCESS_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  partitioned: true,
  path: "/",
};