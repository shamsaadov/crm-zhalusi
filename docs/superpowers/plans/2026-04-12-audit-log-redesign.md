# Audit Log Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать страницу истории изменений: аккордеон-карточки с иконками действий, человеческими именами сущностей и таблицей «было → стало» вместо сырого JSON.

**Architecture:** Серверный endpoint `/api/audit-logs` обогащает каждую запись полем `entityDisplayName` через пакетный batch-resolve по типам сущностей. Клиентская утилита `audit-labels.ts` маппит DB-поля в русские лейблы и форматирует значения. Страница `audit-log.tsx` полностью переписывается на shadcn Accordion.

**Tech Stack:** React, TypeScript, react-hook-form, @tanstack/react-query, shadcn Accordion, date-fns (formatDistanceToNow + ru locale), drizzle-orm (inArray), lucide-react.

**Spec:** [`docs/superpowers/specs/2026-04-12-audit-log-redesign.md`](../specs/2026-04-12-audit-log-redesign.md)

---

## File Structure

**Новые файлы:**

- `client/src/lib/audit-labels.ts` — маппинг DB-полей → русские лейблы, форматирование значений, лейблы действий/типов.

**Изменяемые файлы:**

- `server/storage.ts` — добавить `enrichAuditLogsWithEntityNames()` после `getAuditLogsPaginated`.
- `server/routes.ts` — вызвать enrichment в endpoint `/api/audit-logs`.
- `client/src/pages/audit-log.tsx` — полная переписка: аккордеон-карточки.

---

## Task 1: Create audit-labels utility

**Files:**
- Create: `client/src/lib/audit-labels.ts`

- [ ] **Step 1: Create the file**

Create `client/src/lib/audit-labels.ts` with the following content:

```ts
/**
 * Маппинг DB-полей на русские лейблы для страницы истории изменений.
 * Используется при рендере таблицы «было → стало».
 */

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  order: "Заказ",
  finance: "Финансы",
  warehouse_receipt: "Поступление",
  dealer: "Дилер",
  supplier: "Поставщик",
  color: "Цвет",
  fabric: "Ткань",
  component: "Комплектующая",
  system: "Система",
  cashbox: "Касса",
  expense_type: "Тип расхода",
  multiplier: "Множитель",
};

export const ACTION_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  create: {
    label: "Создание",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  update: {
    label: "Изменение",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  delete: {
    label: "Удаление",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  status_change: {
    label: "Смена статуса",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  order: {
    status: "Статус",
    salePrice: "Цена продажи",
    costPrice: "Себестоимость",
    dealerId: "Дилер (ID)",
    date: "Дата",
    comment: "Комментарий",
    isPaid: "Оплачено",
    cashboxId: "Касса (ID)",
    orderNumber: "Номер заказа",
    dealerDebt: "Долг дилера",
  },
  dealer: {
    fullName: "ФИО",
    phone: "Телефон",
    city: "Город",
    openingBalance: "Начальный баланс",
    isActive: "Активен",
    login: "Логин",
    workshopRateRulon: "Тариф рулонные",
    workshopRateZebra: "Тариф зебра",
  },
  supplier: {
    name: "Название",
    phone: "Телефон",
    openingBalance: "Начальный баланс",
  },
  finance: {
    amount: "Сумма",
    type: "Тип",
    description: "Описание",
    dealerId: "Дилер (ID)",
    supplierId: "Поставщик (ID)",
    cashboxId: "Касса (ID)",
    date: "Дата",
  },
  warehouse_receipt: {
    date: "Дата",
    supplierId: "Поставщик (ID)",
    totalAmount: "Сумма",
    comment: "Комментарий",
  },
  fabric: {
    name: "Название",
    type: "Тип",
    width: "Ширина",
  },
  system: {
    name: "Название",
    type: "Тип",
  },
  component: {
    name: "Название",
    unit: "Единица",
  },
  cashbox: {
    name: "Название",
  },
  color: {
    name: "Название",
  },
  expense_type: {
    name: "Название",
  },
  multiplier: {
    name: "Название",
    value: "Значение",
  },
};

/**
 * Получить русский лейбл для поля. Фолбэк — raw имя поля.
 */
export function getFieldLabel(entityType: string, field: string): string {
  return FIELD_LABELS[entityType]?.[field] ?? field;
}

/**
 * Форматировать значение для отображения в diff-таблице.
 */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") {
    // Форматируем числа с разделителями
    return value.toLocaleString("ru-RU");
  }
  if (typeof value === "string") {
    // Числовые строки → форматируем как числа
    const num = parseFloat(value);
    if (!isNaN(num) && value.trim() === String(num)) {
      return num.toLocaleString("ru-RU");
    }
    if (value === "") return "—";
    return value;
  }
  return String(value);
}

/**
 * Парсит `changes` JSON и возвращает массив изменённых полей.
 * Фильтрует поля, где before === after.
 */
export function parseChanges(
  changes: string | null
): { field: string; before: unknown; after: unknown }[] | null {
  if (!changes) return null;
  try {
    const parsed: { before?: Record<string, unknown>; after?: Record<string, unknown> } =
      JSON.parse(changes);
    const before = parsed.before ?? {};
    const after = parsed.after ?? {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const result: { field: string; before: unknown; after: unknown }[] = [];
    for (const key of allKeys) {
      const bVal = before[key];
      const aVal = after[key];
      // Пропускаем если значения идентичны
      if (JSON.stringify(bVal) === JSON.stringify(aVal)) continue;
      result.push({ field: key, before: bVal, after: aVal });
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: baseline errors only (10), no new ones.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/audit-labels.ts
git commit -m "feat(audit): add field label mappings and value formatting for audit log"
```

---

## Task 2: Server-side entity name enrichment

**Files:**
- Modify: `server/storage.ts` — add `enrichAuditLogsWithEntityNames`
- Modify: `server/routes.ts` — call enrichment in `/api/audit-logs`

- [ ] **Step 1: Add `inArray` to drizzle imports in `server/storage.ts`**

At the top of `server/storage.ts`, find the drizzle-orm import block and add `inArray`:

```ts
import {
  eq,
  and,
  sql,
  gte,
  lte,
  desc,
  sum,
  isNull,
  ne,
  or,
  ilike,
  inArray,
} from "drizzle-orm";
```

- [ ] **Step 2: Add `enrichAuditLogsWithEntityNames` function**

Right after the `getAuditLogsPaginated` method (around line 1411), add this new method to the `DatabaseStorage` class:

```ts
  /**
   * Обогащает записи аудит-лога человеческими именами сущностей.
   * Пакетно резолвит имена из соответствующих таблиц по entityType + entityId.
   */
  async enrichAuditLogsWithEntityNames(
    logs: AuditLog[]
  ): Promise<(AuditLog & { entityDisplayName: string })[]> {
    if (logs.length === 0) return [];

    // Группируем entityId по типу
    const idsByType = new Map<string, Set<string>>();
    for (const log of logs) {
      const set = idsByType.get(log.entityType) ?? new Set();
      set.add(log.entityId);
      idsByType.set(log.entityType, set);
    }

    // Batch-resolve имена из каждой таблицы
    const nameMap = new Map<string, string>(); // `${entityType}:${entityId}` → display name

    const resolve = async (
      entityType: string,
      table: any,
      idCol: any,
      nameExpr: (row: any) => string
    ) => {
      const ids = idsByType.get(entityType);
      if (!ids || ids.size === 0) return;
      const rows = await db
        .select()
        .from(table)
        .where(inArray(idCol, Array.from(ids)));
      for (const row of rows) {
        nameMap.set(`${entityType}:${row.id}`, nameExpr(row));
      }
    };

    await Promise.all([
      resolve("order", orders, orders.id, (r) => `Заказ #${r.orderNumber}`),
      resolve("dealer", dealers, dealers.id, (r) => r.fullName),
      resolve("supplier", suppliers, suppliers.id, (r) => r.name),
      resolve("fabric", fabrics, fabrics.id, (r) => r.name),
      resolve("system", systems, systems.id, (r) => r.name),
      resolve("component", components, components.id, (r) => r.name),
      resolve("cashbox", cashboxes, cashboxes.id, (r) => r.name),
      resolve("color", colors, colors.id, (r) => r.name),
      resolve("expense_type", expenseTypes, expenseTypes.id, (r) => r.name),
      resolve("multiplier", multipliers, multipliers.id, (r) => r.name),
    ]);

    // Собираем результат
    return logs.map((log) => {
      const key = `${log.entityType}:${log.entityId}`;
      let displayName = nameMap.get(key);

      if (!displayName) {
        // Фолбэк: проверяем metadata (для заказов может быть orderNumber)
        if (log.metadata) {
          try {
            const meta = JSON.parse(log.metadata);
            if (meta.orderNumber) displayName = `Заказ #${meta.orderNumber}`;
          } catch {}
        }
      }

      if (!displayName) {
        // Финальный фолбэк: короткий ID
        displayName = `#${log.entityId.slice(0, 8)}`;
      }

      return { ...log, entityDisplayName: displayName };
    });
  }
```

- [ ] **Step 3: Add method signature to the `IStorage` interface**

Find the interface `IStorage` in `server/storage.ts` (near line 322-327 where `getAuditLogsPaginated` is declared). After it, add:

```ts
  enrichAuditLogsWithEntityNames(
    logs: AuditLog[]
  ): Promise<(AuditLog & { entityDisplayName: string })[]>;
```

- [ ] **Step 4: Call enrichment in the route**

In `server/routes.ts`, find the `/api/audit-logs` handler (around line 1521). Replace:

```ts
        const result = await storage.getAuditLogsPaginated(
          req.userId!,
          { limit, cursor },
          { entityType, action, from, to }
        );

        res.json(result);
```

with:

```ts
        const result = await storage.getAuditLogsPaginated(
          req.userId!,
          { limit, cursor },
          { entityType, action, from, to }
        );

        const enrichedData = await storage.enrichAuditLogsWithEntityNames(
          result.data
        );

        res.json({ ...result, data: enrichedData });
```

- [ ] **Step 5: Run typecheck**

```bash
npm run check
```

Expected: baseline errors (10), no new ones. If `inArray` causes issues, verify the import is from `"drizzle-orm"`.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(audit): enrich audit logs with human-readable entity display names"
```

---

## Task 3: Rewrite audit-log page with accordion cards

**Files:**
- Modify (full rewrite): `client/src/pages/audit-log.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace the entire content of `client/src/pages/audit-log.tsx` with:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import {
  ENTITY_TYPE_LABELS,
  ACTION_CONFIG,
  getFieldLabel,
  formatAuditValue,
  parseChanges,
} from "@/lib/audit-labels";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string | null;
  metadata: string | null;
  createdAt: string;
  entityDisplayName: string;
}

interface PaginatedResult {
  data: AuditLog[];
  nextCursor: string | null;
  hasMore: boolean;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  status_change: ArrowRight,
};

function ChangesTable({
  changes,
  entityType,
  action,
}: {
  changes: string | null;
  entityType: string;
  action: string;
}) {
  const parsed = parseChanges(changes);

  if (!parsed) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Нет данных об изменениях
      </p>
    );
  }

  const showBefore = action !== "create";
  const showAfter = action !== "delete";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1.5 pr-4 font-medium text-muted-foreground">
              Поле
            </th>
            {showBefore && (
              <th className="py-1.5 pr-4 font-medium text-muted-foreground">
                Было
              </th>
            )}
            {showAfter && (
              <th className="py-1.5 font-medium text-muted-foreground">
                Стало
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {parsed.map(({ field, before, after }) => (
            <tr key={field} className="border-b last:border-0">
              <td className="py-1.5 pr-4 text-muted-foreground">
                {getFieldLabel(entityType, field)}
              </td>
              {showBefore && (
                <td className="py-1.5 pr-4 text-red-600/70 dark:text-red-400/70">
                  {formatAuditValue(before)}
                </td>
              )}
              {showAfter && (
                <td className="py-1.5 font-medium">
                  {formatAuditValue(after)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLogPage() {
  const [, navigate] = useLocation();
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allData, setAllData] = useState<AuditLog[]>([]);

  const params = new URLSearchParams({
    limit: "20",
    ...(entityType !== "all" && { entityType }),
    ...(action !== "all" && { action }),
    ...(from && { from }),
    ...(to && { to }),
    ...(cursor && { cursor }),
  });

  const { data, isLoading } = useQuery<PaginatedResult>({
    queryKey: [`/api/audit-logs?${params.toString()}`],
  });

  const displayData = cursor
    ? [...allData, ...(data?.data || [])]
    : data?.data || [];

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setAllData(displayData);
      setCursor(data.nextCursor);
    }
  };

  const handleFilterChange = () => {
    setAllData([]);
    setCursor(null);
  };

  const handleEntityClick = (log: AuditLog) => {
    if (log.entityType === "order") {
      navigate(`/orders?edit=${log.entityId}`);
    }
  };

  return (
    <Layout title="История действий">
      <div className="space-y-4">
        {/* Фильтры */}
        <div className="flex flex-wrap gap-3">
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v);
              handleFilterChange();
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Тип сущности" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              handleFilterChange();
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Действие" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              handleFilterChange();
            }}
            className="w-[160px]"
            placeholder="От"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              handleFilterChange();
            }}
            className="w-[160px]"
            placeholder="До"
          />
        </div>

        {/* Содержимое */}
        {isLoading && allData.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : displayData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет записей
          </div>
        ) : (
          <>
            <Accordion type="multiple" className="space-y-2">
              {displayData.map((log) => {
                const config = ACTION_CONFIG[log.action] ?? {
                  label: log.action,
                  color: "text-muted-foreground",
                  bgColor: "bg-muted",
                };
                const Icon = ACTION_ICONS[log.action] ?? Pencil;
                const entityLabel =
                  ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType;
                const isClickable = log.entityType === "order";
                const timeAgo = formatDistanceToNow(
                  new Date(log.createdAt),
                  { addSuffix: true, locale: ru }
                );

                return (
                  <AccordionItem
                    key={log.id}
                    value={log.id}
                    className="border rounded-lg px-4 data-[state=open]:bg-muted/30"
                  >
                    <AccordionTrigger className="hover:no-underline py-3 gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div
                          className={`shrink-0 rounded-full p-1.5 ${config.bgColor}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium text-sm truncate ${
                                isClickable
                                  ? "text-primary hover:underline cursor-pointer"
                                  : ""
                              }`}
                              onClick={
                                isClickable
                                  ? (e) => {
                                      e.stopPropagation();
                                      handleEntityClick(log);
                                    }
                                  : undefined
                              }
                            >
                              {log.entityDisplayName}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {entityLabel}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {config.label}
                          </span>
                        </div>

                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {timeAgo}
                        </span>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-0 pb-3">
                      <ChangesTable
                        changes={log.changes}
                        entityType={log.entityType}
                        action={log.action}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {data?.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Загрузить ещё
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: baseline (10), no new errors. Possible issues to watch for:
- `wouter` import — the project uses `wouter` for routing (already imported in other pages like `view-order-dialog.tsx`).
- `date-fns/locale` — check that `ru` locale is available (the project already imports from `date-fns`).

- [ ] **Step 3: Quick smoke test**

```bash
npm run dev
```

Open the audit log page in the browser. Verify:
- Accordion cards render correctly.
- Expanding a card shows the "Поле / Было / Стало" table.
- Entity names appear (e.g., "Заказ #1234" instead of UUID).
- Icons and colors match actions.
- Filters still work.
- "Загрузить ещё" still works.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/audit-log.tsx
git commit -m "feat(audit): rewrite audit log page with accordion cards, readable diffs, entity names

Replaces flat table with accordion cards. Each card shows an action
icon, human-readable entity name (resolved server-side), action type,
and relative timestamp. Expanding a card reveals a 'before/after'
table with Russian field labels and formatted values."
```

---

## Summary

**Commits:**
1. `feat(audit): add field label mappings and value formatting for audit log`
2. `feat(audit): enrich audit logs with human-readable entity display names`
3. `feat(audit): rewrite audit log page with accordion cards, readable diffs, entity names`

**Файлы, затронутые каждым коммитом:**

| # | Файлы |
|---|-------|
| 1 | `client/src/lib/audit-labels.ts` (new) |
| 2 | `server/storage.ts` + `server/routes.ts` |
| 3 | `client/src/pages/audit-log.tsx` (full rewrite) |

**Критерии успеха:** см. раздел «Критерии успеха» в [спеке](../specs/2026-04-12-audit-log-redesign.md) — все 8 пунктов.
