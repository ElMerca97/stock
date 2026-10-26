"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "./Button";

export interface ImageValue {
  /** Current persisted URL (or null). */
  url: string | null;
  /** New file selected but not yet uploaded. */
  file: File | null;
}

const MAX = 2 * 1024 * 1024;

/**
 * Image picker with local preview. The file is uploaded only when the parent form is saved
 * (see `uploadImageIfNeeded`).
 */
export function ImageUpload({ value, onChange, label = "Imagen", rounded = false }: { value: ImageValue; onChange: (v: ImageValue) => void; label?: string; rounded?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value.url);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value.file) {
      const u = URL.createObjectURL(value.file);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    setPreview(value.url);
  }, [value.file, value.url]);

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-4">
        <div className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 ${rounded ? "rounded-full" : "rounded-lg"}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-7 w-7 text-slate-400" />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => ref.current?.click()}>
              {preview ? "Reemplazar" : "Subir imagen"}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onChange({ url: null, file: null })}>
                Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">PNG, JPG o WEBP. Máx. 2 MB.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > MAX) return setError("La imagen supera 2 MB.");
            if (!f.type.startsWith("image/")) return setError("El archivo debe ser una imagen.");
            setError(null);
            onChange({ url: value.url, file: f });
          }}
        />
      </div>
    </div>
  );
}
