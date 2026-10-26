import { readStoredFile } from "@/services/storage/files";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ bucket: string; file: string }> }) {
  const { bucket, file } = await ctx.params;
  const f = await readStoredFile(`${bucket}/${file}`);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(f.data, "base64"), {
    headers: { "Content-Type": f.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
