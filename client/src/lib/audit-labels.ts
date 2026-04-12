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
    const allKeys = new Set(Object.keys(before).concat(Object.keys(after)));
    const result: { field: string; before: unknown; after: unknown }[] = [];
    for (const key of Array.from(allKeys)) {
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
