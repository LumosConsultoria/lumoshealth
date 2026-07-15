import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Deepgram não configurada." }, { status: 503 });
  }

  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      authorization: `Token ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 30 }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Não foi possível iniciar a sessão de voz." }, { status: 502 });
  }

  const token = await response.json() as { access_token: string; expires_in: number };
  return NextResponse.json(
    { accessToken: token.access_token, expiresIn: token.expires_in },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
