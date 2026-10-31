// Общее для экранов склада.

import type { Fabric } from "@shared/schema";

/** Ширина рулона в метрах (в справочнике бывает и в см, и в м). */
export function fabricWidthMeters(fabric: Pick<Fabric, "width"> | undefined | null): number {
  const raw = fabric?.width ? parseFloat(fabric.width.toString()) : 0;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 10 ? raw / 100 : raw;
}

const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

/** Количество до 3 знаков, как в УЭС. */
export function fmtQty(v: number | string | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return qtyFmt.format(n);
}
