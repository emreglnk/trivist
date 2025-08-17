import { NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const count = Math.min(5, Math.max(1, Number(searchParams.get("count") || 1)));
    const db = await getDb();
    const col = db.collection("questions");

    const pipeline: Array<Record<string, unknown>> = [];
    if (category) pipeline.push({ $match: { category } });
    pipeline.push({ $sample: { size: count } });
    pipeline.push({ $project: { _id: 0 } });

    const docs = await col.aggregate(pipeline).toArray();
    return new Response(JSON.stringify({ items: docs }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: Error | unknown) {
    const errorMessage = e instanceof Error ? e.message : 'failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}


