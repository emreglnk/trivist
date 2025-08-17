import { NextRequest } from "next/server";
import { verifyMessage } from "viem";

export async function POST(req: NextRequest) {
  try {
    const { address, message, signature } = await req.json();
    if (!address || !message || !signature) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400 });
    }
    const ok = await verifyMessage({ address, message, signature });
    if (!ok) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
    // TODO: issue JWT or session cookie
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: Error | unknown) {
    const errorMessage = e instanceof Error ? e.message : 'failed';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
}


