import type { ReceiptBusinessInfo } from "@/types";
import { getReceiptBusinessInfo as getBusinessReceiptInfo } from "@/config/business";

export function getReceiptBusinessInfo(): ReceiptBusinessInfo {
  return getBusinessReceiptInfo();
}
