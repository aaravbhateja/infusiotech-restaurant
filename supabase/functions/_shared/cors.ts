// Both public edge functions (resolve-table, create-order) are called via
// fetch() straight from a browser tab — the customer's phone browser after
// scanning a table's QR code — not from a native app where CORS doesn't
// apply. Without these headers the browser blocks even a successful
// response (and, for a POST with a custom Authorization/Content-Type
// header, blocks the preflight OPTIONS request before the real request is
// even sent), which showed up as a generic "Load failed" / "Failed to
// fetch" with no server-side error logged anywhere — because the server
// never actually got to run.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
