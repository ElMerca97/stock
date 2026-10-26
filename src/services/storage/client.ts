import type { ImageValue } from "@/components/ui/ImageUpload";

/** Client helper: uploads the selected file (if any) to the storage API and returns the final URL. */
export async function uploadImageIfNeeded(value: ImageValue, bucket: "products" | "categories" | "avatars"): Promise<string | null> {
  if (!value.file) return value.url;
  const fd = new FormData();
  fd.append("bucket", bucket);
  fd.append("file", value.file);
  const res = await fetch("/api/storage", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo subir la imagen.");
  return json.url;
}
