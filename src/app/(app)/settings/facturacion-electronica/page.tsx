import { requirePageUser } from "@/services/auth/session";
import { ElectronicInvoicingSettingsView } from "@/views/settings/ElectronicInvoicingSettingsView";

export const metadata = { title: "Configuración de facturación electrónica — Ferretería Lausana" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePageUser(true);
  return <ElectronicInvoicingSettingsView />;
}
