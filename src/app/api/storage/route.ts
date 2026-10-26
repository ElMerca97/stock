import { getSessionUser } from "@/services/auth/session";
import { BUCKETS, storeFile, type Bucket } from "@/services/storage/files";

export const dynamic = "force-dynamic";

/** Upload an image. products/categories buckets require admin; avatars any authenticated user. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  try {
    const form = await req.formData();
    const bucket = String(form.get("bucket") ?? "") as Bucket;
    const file = form.get("file");
    if (!BUCKETS.includes(bucket)) return Response.json({ error: "Bucket inválido" }, { status: 400 });
    if (bucket !== "avatars" && user.rol !== "admin")
      return Response.json({ error: "No tenés permisos para subir imágenes" }, { status: 403 });
    if (!(file instanceof File)) return Response.json({ error: "Archivo requerido" }, { status: 400 });
    const url = await storeFile(bucket, file, user.id);
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Error al subir" }, { status: 400 });
  }
}
