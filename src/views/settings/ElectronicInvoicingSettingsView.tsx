"use client";

import { useEffect, useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import {
  getFiscalSettings,
  saveFiscalSettings,
  testFiscalConnection,
  listCfeDocuments,
  retryCfeDocument,
} from "@/services/dgi-connection/actions";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/Feedback";
import { Input, Select } from "@/components/ui/Input";
import { toast } from "sonner";

export function ElectronicInvoicingSettingsView() {
  const settingsReq = useAsync(() => getFiscalSettings(), []);
  const cfesReq = useAsync(() => listCfeDocuments(1, 20), []);

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("none");
  const [environment, setEnvironment] = useState("homologacion");
  const [defaultCfeType, setDefaultCfeType] = useState("e-ticket");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsReq.data) return;
    const s = settingsReq.data;
    const t = setTimeout(() => {
      setEnabled(s.enabled);
      setProvider(s.provider);
      setEnvironment(s.environment);
      setDefaultCfeType(s.defaultCfeType);
    }, 0);
    return () => clearTimeout(t);
  }, [settingsReq.data]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveFiscalSettings({ enabled, provider, environment, defaultCfeType });
      if (result.ok) {
        toast.success("Configuración guardada.");
        settingsReq.reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testFiscalConnection();
      if (result.ok) {
        setTestResult(result.data.ok ? `Conexión OK: ${result.data.message}` : `Sin conexión: ${result.data.message}`);
      } else {
        setTestResult(`Error: ${result.error}`);
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleRetry(id: number) {
    const result = await retryCfeDocument(id);
    if (result.ok) {
      toast.success("Reintento registrado.");
      cfesReq.reload();
    } else {
      toast.error(result.error);
    }
  }

  if (settingsReq.loading) return <Loading />;
  if (settingsReq.error) return <ErrorState message={settingsReq.error} onRetry={settingsReq.reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturación electrónica"
        description="Configuración de la conexión con el proveedor de facturación electrónica (DGI Uruguay)."
      />
      <div className="card p-4 space-y-4">
        <p className="text-sm text-slate-500">
          La integración es opcional. Mientras no exista un proveedor y credenciales reales configurados, las ventas
          siguen funcionando y los comprobantes se emiten como comprobantes comerciales.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Habilitar integración fiscal
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Proveedor" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="none" />
<Select
            label="Entorno"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            options={[
              { value: "testing", label: "Testing" },
              { value: "homologacion", label: "Homologación" },
              { value: "produccion", label: "Producción" },
            ]}
          />
<Select
            label="Tipo de CFE por defecto"
            value={defaultCfeType}
            onChange={(e) => setDefaultCfeType(e.target.value)}
            options={[
              { value: "e-ticket", label: "e-Ticket" },
              { value: "e-factura", label: "e-Factura" },
              { value: "nota-credito", label: "Nota de crédito" },
              { value: "nota-debito", label: "Nota de débito" },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} loading={saving}>Guardar</Button>
          <Button variant="secondary" onClick={handleTest} loading={testing}>Probar conexión</Button>
        </div>
        {testResult && <p className="text-sm text-slate-600 dark:text-slate-300">{testResult}</p>}

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60">
          <p className="font-semibold mb-1">Variables de entorno requeridas (servidor):</p>
          <p>DGI_ENABLED, DGI_PROVIDER, DGI_ENVIRONMENT, DGI_API_BASE_URL, DGI_API_KEY, DGI_CLIENT_ID, DGI_CLIENT_SECRET, DGI_CERTIFICATE_REF, DGI_TIMEOUT_MS.</p>
          <p className="mt-1">Las credenciales nunca se exponen al navegador.</p>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Historial de emisiones</h2>
        {cfesReq.loading && <Loading />}
        {cfesReq.error && <ErrorState message={cfesReq.error} onRetry={cfesReq.reload} />}
        {!cfesReq.loading && (cfesReq.data?.rows.length ?? 0) === 0 && (
          <EmptyState title="Sin emisiones" description="Todavía no hay comprobantes fiscales registrados." />
        )}
        {!cfesReq.loading && (cfesReq.data?.rows.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1">ID</th>
                  <th className="py-1">Venta</th>
                  <th className="py-1">Tipo</th>
                  <th className="py-1">Estado</th>
                  <th className="py-1">Serie/Número</th>
                  <th className="py-1">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cfesReq.data?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-1">{row.id}</td>
                    <td className="py-1">#{row.saleId}</td>
                    <td className="py-1">{row.cfeType}</td>
                    <td className="py-1">{row.status}</td>
                    <td className="py-1">{row.serie ?? "-"}{row.numero ? `/${row.numero}` : ""}</td>
                    <td className="py-1">
                      {row.status !== "issued" && (
                        <Button size="sm" variant="secondary" onClick={() => handleRetry(row.id)}>
                          Reintentar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

