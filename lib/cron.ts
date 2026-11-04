/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; nothing else may trigger these. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
