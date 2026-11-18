/**
 * Opt-in, loopback-only demonstration gate.
 *
 * This is deliberately NOT production authentication. Never enable it for
 * real patient data, public deployments or shared development machines.
 */
export const DEMO_HEADER = "x-lumos-local-demo";
export const MAX_DEMO_TRANSCRIPT = 12000;

export function isLocalDemoRequest(request, env = process.env) {
  if (env.NODE_ENV === "production" || env.LUMOS_ENABLE_LOCAL_DEMO_API !== "true") {
    return false;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase())) {
    return false;
  }
  if (request.headers.get(DEMO_HEADER) !== "local-only") return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return false;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  return true;
}

export function demoApiDeniedResponse() {
  return Response.json(
    { error: "API clínica desabilitada fora da demonstração local.", demo: true },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
