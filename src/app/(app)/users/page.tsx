import { UsersView } from "@/views/users/UsersView";
import { requirePageUser } from "@/services/auth/session";

export const metadata = { title: "Usuarios — Ferretería Lausana" };

export default async function Page() {
  await requirePageUser(true);
  return <UsersView />;
}
