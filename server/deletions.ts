// Пометка на удаление как в УЭС (DeletionSettings.jsx):
// из рабочих разделов объект только помечается, окончательно удаляется
// в «Настройки → Помеченные на удаление» и только если на него ничего не ссылается.

import { sql } from "drizzle-orm";
import { db } from "./db";

type Exec = { execute: typeof db.execute };

export type DeletableKind =
  | "orders"
  | "warehouse-receipts"
  | "finance"
  | "colors"
  | "fabrics"
  | "components"
  | "systems"
  | "multipliers"
  | "dealers"
  | "suppliers"
  | "cashboxes"
  | "expense-types";

interface Dependency {
  table: string;
  column: string;
  label: string; // «Створки в заказах»
  /** Учитывать только строки, которые сами не помечены на удаление (для подписи). */
  liveOnly?: boolean;
}

interface KindDef {
  table: string;
  category: string;
  /** SQL-выражение подписи объекта. */
  titleSql: string;
  /** Пометка: для денежных операций — isDraft + deletedAt. */
  finance?: boolean;
  dependencies: Dependency[];
  /** Удалить служебные хвосты перед окончательным удалением (в той же транзакции). */
  beforeHardDelete?: (exec: Exec, id: string) => Promise<void>;
}

const KINDS: Record<DeletableKind, KindDef> = {
  orders: {
    table: "orders",
    category: "Заказ покупателя",
    titleSql: `'Заказ №' || t.order_number || ' от ' || to_char(t.date, 'DD.MM.YYYY')`,
    dependencies: [],
    beforeHardDelete: async (exec, id) => {
      // Замеры из приложения остаются, но теряют ссылку на заказ (как и раньше).
      await exec.execute(sql`update measurements set order_id = null where order_id = ${id}`);
    },
  },
  "warehouse-receipts": {
    table: "warehouse_receipts",
    category: "Поступление товаров",
    titleSql: `'Поступление от ' || to_char(t.date, 'DD.MM.YYYY') || coalesce(' · ' || (select s.name from suppliers s where s.id = t.supplier_id), '') || ' · ' || coalesce(t.total, 0)::text`,
    dependencies: [],
  },
  finance: {
    table: "finance_operations",
    category: "Денежный документ",
    titleSql: `(case t.type when 'income' then 'ПКО' when 'transfer' then 'Перемещение' else 'РКО' end) || ' от ' || to_char(t.date, 'DD.MM.YYYY') || ' · ' || t.amount::text`,
    finance: true,
    dependencies: [],
  },
  colors: {
    table: "colors",
    category: "Справочник «Цвета»",
    titleSql: "t.name",
    dependencies: [
      { table: "fabrics", column: "color_id", label: "Ткани с этим цветом" },
      { table: "components", column: "color_id", label: "Комплектующие с этим цветом" },
      { table: "systems", column: "color_id", label: "Системы с этим цветом" },
      { table: "order_sashes", column: "system_color_id", label: "Створки с этим цветом системы" },
      { table: "order_sashes", column: "fabric_color_id", label: "Створки с этим цветом ткани" },
    ],
  },
  fabrics: {
    table: "fabrics",
    category: "Справочник «Ткани»",
    titleSql: "t.name",
    dependencies: [
      { table: "order_sashes", column: "fabric_id", label: "Створки в заказах" },
      { table: "warehouse_receipt_items", column: "fabric_id", label: "Строки поступлений" },
      { table: "warehouse_writeoffs", column: "fabric_id", label: "Списания со склада" },
      { table: "cutting_layouts", column: "fabric_id", label: "Раскрои заказов" },
    ],
  },
  components: {
    table: "components",
    category: "Справочник «Комплектующие»",
    titleSql: "t.name",
    dependencies: [
      { table: "order_sashes", column: "component_id", label: "Строки в заказах" },
      { table: "warehouse_receipt_items", column: "component_id", label: "Строки поступлений" },
      { table: "warehouse_writeoffs", column: "component_id", label: "Списания со склада" },
      { table: "system_components", column: "component_id", label: "Системы, в составе которых оно есть" },
    ],
  },
  systems: {
    table: "systems",
    category: "Справочник «Системы»",
    titleSql: "t.name",
    dependencies: [{ table: "order_sashes", column: "system_id", label: "Створки в заказах" }],
  },
  multipliers: {
    table: "multipliers",
    category: "Справочник «Множители»",
    titleSql: "coalesce(t.name, 'Множитель ' || t.value::text)",
    dependencies: [{ table: "systems", column: "multiplier_id", label: "Системы с этим множителем" }],
  },
  dealers: {
    table: "dealers",
    category: "Справочник «Дилеры»",
    titleSql: "t.full_name",
    dependencies: [
      { table: "orders", column: "dealer_id", label: "Заказы" },
      { table: "finance_operations", column: "dealer_id", label: "Денежные документы" },
      { table: "measurements", column: "dealer_id", label: "Замеры из приложения" },
    ],
    beforeHardDelete: async (exec, id) => {
      // Служебное: токены уведомлений и сами уведомления дилеру.
      await exec.execute(sql`delete from device_tokens where dealer_id = ${id}`);
      await exec.execute(sql`delete from dealer_notifications where dealer_id = ${id}`);
    },
  },
  suppliers: {
    table: "suppliers",
    category: "Справочник «Поставщики»",
    titleSql: "t.name",
    dependencies: [
      { table: "warehouse_receipts", column: "supplier_id", label: "Поступления товаров" },
      { table: "finance_operations", column: "supplier_id", label: "Денежные документы" },
    ],
  },
  cashboxes: {
    table: "cashboxes",
    category: "Справочник «Кассы»",
    titleSql: "t.name",
    dependencies: [
      { table: "finance_operations", column: "cashbox_id", label: "Денежные документы" },
      { table: "finance_operations", column: "from_cashbox_id", label: "Перемещения из этой кассы" },
      { table: "finance_operations", column: "to_cashbox_id", label: "Перемещения в эту кассу" },
    ],
  },
  "expense-types": {
    table: "expense_types",
    category: "Справочник «Статьи расходов и доходов»",
    titleSql: "t.name",
    dependencies: [{ table: "finance_operations", column: "expense_type_id", label: "Денежные документы" }],
  },
};

export function isDeletableKind(v: string): v is DeletableKind {
  return v in KINDS;
}

const ident = (s: string) => sql.raw(`"${s.replace(/"/g, "")}"`);

/** Принадлежит ли объект пользователю. */
async function owned(kind: DeletableKind, id: string, userId: string) {
  const def = KINDS[kind];
  const r = await db.execute(
    sql`select 1 from ${ident(def.table)} where id = ${id} and user_id = ${userId} limit 1`
  );
  return r.rows.length > 0;
}

export async function markDeleted(kind: DeletableKind, id: string, userId: string): Promise<boolean> {
  if (!(await owned(kind, id, userId))) return false;
  const def = KINDS[kind];
  if (def.finance) {
    await db.execute(sql`update finance_operations set is_draft = true, deleted_at = now() where id = ${id}`);
  } else {
    await db.execute(sql`update ${ident(def.table)} set deleted_at = now() where id = ${id} and deleted_at is null`);
  }
  return true;
}

export async function restoreDeleted(kind: DeletableKind, id: string, userId: string): Promise<boolean> {
  if (!(await owned(kind, id, userId))) return false;
  const def = KINDS[kind];
  if (def.finance) {
    await db.execute(sql`update finance_operations set is_draft = false, deleted_at = null where id = ${id}`);
  } else {
    await db.execute(sql`update ${ident(def.table)} set deleted_at = null where id = ${id}`);
  }
  return true;
}

export interface MarkedItem {
  key: string;
  kind: DeletableKind;
  id: string;
  title: string;
  category: string;
  deletedAt: string | null;
  dependencies: { title: string; count: number }[];
}

async function dependenciesOf(kind: DeletableKind, id: string) {
  const out: { title: string; count: number }[] = [];
  for (const dep of KINDS[kind].dependencies) {
    const r = await db.execute(
      sql`select count(*)::int as n from ${ident(dep.table)} where ${ident(dep.column)} = ${id}`
    );
    const n = Number((r.rows[0] as any)?.n ?? 0);
    if (n > 0) out.push({ title: `${dep.label}: ${n}`, count: n });
  }
  return out;
}

export async function listMarked(userId: string): Promise<MarkedItem[]> {
  const items: MarkedItem[] = [];
  for (const kind of Object.keys(KINDS) as DeletableKind[]) {
    const def = KINDS[kind];
    const where = def.finance
      ? sql`t.user_id = ${userId} and t.is_draft = true and t.deleted_at is not null`
      : sql`t.user_id = ${userId} and t.deleted_at is not null`;
    const r = await db.execute(
      sql`select t.id, ${sql.raw(def.titleSql)} as title, t.deleted_at from ${ident(def.table)} t where ${where}`
    );
    for (const row of r.rows as any[]) {
      items.push({
        key: `${kind}:${row.id}`,
        kind,
        id: row.id,
        title: row.title ?? "—",
        category: def.category,
        deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
        dependencies: await dependenciesOf(kind, row.id),
      });
    }
  }
  return items.sort((a, b) => String(b.deletedAt ?? "").localeCompare(String(a.deletedAt ?? "")));
}

export type HardDeleteResult = { ok: true } | { ok: false; status: number; message: string };

/** Окончательное удаление: только помеченный объект и только без связей. */
export async function hardDelete(kind: DeletableKind, id: string, userId: string): Promise<HardDeleteResult> {
  const def = KINDS[kind];
  const marked = await db.execute(
    def.finance
      ? sql`select 1 from finance_operations where id = ${id} and user_id = ${userId} and is_draft = true and deleted_at is not null`
      : sql`select 1 from ${ident(def.table)} where id = ${id} and user_id = ${userId} and deleted_at is not null`
  );
  if (marked.rows.length === 0) {
    return { ok: false, status: 404, message: "Объект не найден или не помечен на удаление" };
  }
  const deps = await dependenciesOf(kind, id);
  if (deps.length) {
    return { ok: false, status: 409, message: `Удаление запрещено. ${deps.map((d) => d.title).join("; ")}` };
  }
  try {
    await db.transaction(async (tx) => {
      if (def.beforeHardDelete) await def.beforeHardDelete(tx as unknown as Exec, id);
      await tx.execute(sql`delete from ${ident(def.table)} where id = ${id}`);
    });
    return { ok: true };
  } catch (error: any) {
    // Внешний ключ, который проверка не учла, — не даём удалить.
    if (error?.code === "23503") {
      return { ok: false, status: 409, message: "Удаление запрещено: на объект ссылаются другие данные" };
    }
    throw error;
  }
}
