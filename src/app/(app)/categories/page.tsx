import { CategoriesView } from "@/views/categories/CategoriesView";
import { requirePageUser } from "@/services/auth/session";

export const metadata = { title: "Categorías — StockPro" };

export default async function Page() {
  await requirePageUser(true);
  return <CategoriesView />;
}
