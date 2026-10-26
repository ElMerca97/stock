"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/format";

export function Field({ label, error, hint, children, className, required }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      {label && (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="block text-xs text-red-600 dark:text-red-400">{error}</span> : hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export function Input({ label, error, hint, icon, className, required, ...rest }: InputProps) {
  const input = (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input {...rest} required={required} className={cn("input-base", icon ? "pl-9" : "", error && "border-red-500", className)} />
    </div>
  );
  if (!label && !error && !hint) return input;
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {input}
    </Field>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function Textarea({ label, error, className, required, ...rest }: TextareaProps) {
  return (
    <Field label={label} error={error} required={required}>
      <textarea {...rest} required={required} className={cn("input-base min-h-[80px] resize-y", className)} />
    </Field>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}
export function Select({ label, error, options, placeholder, className, required, ...rest }: SelectProps) {
  const el = (
    <select {...rest} required={required} className={cn("input-base pr-8", className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label && !error) return el;
  return (
    <Field label={label} error={error} required={required}>
      {el}
    </Field>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm disabled:opacity-50"
    >
      <span className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label && <span className="text-slate-700 dark:text-slate-300">{label}</span>}
    </button>
  );
}
