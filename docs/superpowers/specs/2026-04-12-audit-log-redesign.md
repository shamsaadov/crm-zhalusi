# Редизайн страницы истории изменений (audit log)

**Статус:** утверждён · **Дата:** 2026-04-12

## Проблема

Страница `/audit-log` показывает историю изменений в виде плоского списка карточек с сырым JSON diff. Имена полей — на английском (`salePrice`, `status`), значения — без форматирования, сущности — по UUID без человеческих имён.

## Цели

1. **Читаемый diff** — русские имена полей, форматированные значения, таблица «было → стало».
2. **Привязка к сущности** — «Заказ #1234» вместо UUID, клик → переход к сущности.
3. **Визуальный timeline** — аккордеон-карточки с иконками действий и цветовой кодировкой.

### Не-цели

- Поиск по содержимому изменений.
- Экспорт в Excel/CSV.
- Группировка связанных изменений.
- Резолв ID-значений внутри diff (например, `dealerId` UUID → имя дилера внутри таблицы «было/стало»).

## Решение

### 1. Серверное обогащение entity-имён

В `server/storage.ts` — новая функция `enrichAuditLogsWithEntityNames`. После выборки логов пакетно резолвит имена сущностей:

| entityType | Таблица | Поле | Формат |
|---|---|---|---|
| `order` | `orders` | `orderNumber` | `Заказ #1234` |
| `dealer` | `dealers` | `fullName` | имя как есть |
| `supplier` | `suppliers` | `name` | имя как есть |
| `fabric` | `fabrics` | `name` | имя как есть |
| `system` | `systems` | `name` | имя как есть |
| `component` | `components` | `name` | имя как есть |
| `cashbox` | `cashboxes` | `name` | имя как есть |
| `color` | `colors` | `name` | имя как есть |
| `expense_type` | `expenseTypes` | `name` | имя как есть |
| `multiplier` | `multipliers` | `name` | имя как есть |
| `finance` | — | `entityId` (short) | `#abc123` |
| `warehouse_receipt` | — | `entityId` (short) | `#abc123` |

Для order также учитывать уже существующий `metadata.orderNumber` как фолбэк.

API `/api/audit-logs` возвращает дополнительное поле `entityDisplayName: string` на каждой записи.

### 2. Маппинг полей — `client/src/lib/audit-labels.ts`

Экспортирует:

- `FIELD_LABELS: Record<string, Record<string, string>>` — маппинг DB-field → русский лейбл по entityType.
- `ACTION_LABELS: Record<string, { label: string; icon: string; color: string }>` — лейблы действий с иконками и цветами.
- `ENTITY_TYPE_LABELS: Record<string, string>` — «order» → «Заказ», «dealer» → «Дилер», и т. д.
- `formatAuditValue(value: unknown): string` — форматирование значений: числа → currency с разделителями, `true/false` → `Да/Нет`, `null/undefined` → `—`, строки — как есть.
- `getFieldLabel(entityType: string, field: string): string` — резолвит лейбл с фолбэком на raw-имя поля.

### 3. UI — `client/src/pages/audit-log.tsx` (полная переписка)

**Фильтры (верхняя часть):**
Остаются как сейчас — селекты по типу сущности, действию, дате. Без изменений.

**Список (основная часть):**
Используем shadcn `Accordion` (`AccordionItem`, `AccordionTrigger`, `AccordionContent`).

**Шапка каждой карточки (AccordionTrigger):**
```
[иконка действия]  [entity display name]  —  [action label]        [relative time]  ▼
```

- Иконка по типу действия с цветом:
  - `create` → `Plus` зелёная (`text-green-600`)
  - `update` → `Pencil` синяя (`text-blue-600`)
  - `delete` → `Trash2` красная (`text-red-600`)
  - `status_change` → `ArrowRight` жёлтая (`text-amber-600`)
- Entity display name — кликабельная ссылка (для заказов → `/orders?edit={entityId}`, для остальных — просто текст).
- Время — `formatDistanceToNow(createdAt, { addSuffix: true, locale: ru })`.

**Тело (AccordionContent):**
Таблица изменений, если `changes` не null:

| Поле | Было | Стало |
|---|---|---|
| Статус | Новый | **В работе** |
| Цена продажи | 1 500 | **2 000** |

- Для `create` — только колонка «Стало».
- Для `delete` — только колонка «Было».
- Для `update`/`status_change` — обе, новые значения жирным.
- Поля без изменений (before[key] === after[key]) — не показываем.
- Если `changes` is null — показать «Нет данных об изменениях».

**Пагинация:**
«Загрузить ещё» — как сейчас, без изменений.

**Пустое состояние:**
«Нет записей» — как сейчас.

## Компонентные изменения

| Файл | Действие |
|---|---|
| `client/src/lib/audit-labels.ts` | Создать |
| `client/src/pages/audit-log.tsx` | Полная переписка |
| `server/storage.ts` | Добавить `enrichAuditLogsWithEntityNames` |
| `server/routes.ts` | Вызвать enrichment в `/api/audit-logs` |

## Критерии успеха

1. Каждая запись показывает человеческое имя сущности (Заказ #1234, Дилер Иванов), а не UUID.
2. Изменения отображаются как таблица «Поле / Было / Стало» с русскими именами полей.
3. Числовые значения форматированы с разделителями, boolean → Да/Нет, null → «—».
4. Иконки и цвета действий визуально различимы.
5. Клик по имени заказа открывает заказ на редактирование.
6. Фильтры и пагинация работают как раньше.
7. Старые записи (без metadata) показывают entityType + короткий ID как фолбэк.
8. Аккордеон раскрывается/закрывается плавно.
