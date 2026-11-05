/** Runs once when a server instance starts (not at build time): see src/lib/bootstrap.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { bootstrap } = await import("./lib/bootstrap");
  await bootstrap();
}
