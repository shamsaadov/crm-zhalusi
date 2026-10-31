// Общая для клиента и сервера логика видов операций (как ПКО/РКО в УЭС).

import {
  EXPENSE_OPERATION_TYPES,
  INCOME_OPERATION_TYPES,
  type ExpenseOperationType,
  type IncomeOperationType,
} from "./schema";

export interface OperationLike {
  type: string;
  operationType?: string | null;
  dealerId?: string | null;
  expenseTypeId?: string | null;
}

export interface ArticleLike {
  operationType?: string | null;
}

const INCOME = new Set<string>(INCOME_OPERATION_TYPES);
const EXPENSE = new Set<string>(EXPENSE_OPERATION_TYPES);

export function isIncomeOperationType(v: unknown): v is IncomeOperationType {
  return typeof v === "string" && INCOME.has(v);
}

export function isExpenseOperationType(v: unknown): v is ExpenseOperationType {
  return typeof v === "string" && EXPENSE.has(v);
}

/**
 * Вид операции платежа. Явно заданный побеждает; иначе выводится из типа,
 * дилера и вида операции статьи — так старые записи без вида тоже попадают в отчёты.
 */
export function resolveOperationType(
  op: OperationLike,
  article?: ArticleLike | null
): IncomeOperationType | ExpenseOperationType | "Перемещение" {
  if (op.type === "transfer") return "Перемещение";
  if (op.type === "supplier_payment") return "Оплата поставщику";
  if (op.type === "income") {
    if (isIncomeOperationType(op.operationType)) return op.operationType;
    if (isIncomeOperationType(article?.operationType)) return article!.operationType as IncomeOperationType;
    return op.dealerId ? "Оплата от покупателя" : "Прочее поступление";
  }
  if (isExpenseOperationType(op.operationType)) return op.operationType;
  if (isExpenseOperationType(article?.operationType)) return article!.operationType as ExpenseOperationType;
  return "Операционные расходы";
}

/** Какой контрагент нужен виду операции. */
export function counterpartyFor(
  operationType: string | null | undefined
): "dealer" | "supplier" | null {
  switch (operationType) {
    case "Оплата от покупателя":
    case "Возврат покупателю":
      return "dealer";
    case "Оплата поставщику":
    case "Возврат от поставщика":
      return "supplier";
    default:
      return null;
  }
}

/** Как вид операции влияет на отчёты — подсказка в форме документа. */
export const OPERATION_TYPE_HINTS: Record<string, string> = {
  "Оплата от покупателя": "Уменьшает долг дилера. В ОПиУ не попадает — выручка признаётся при отгрузке.",
  "Возврат от поставщика": "Поставщик вернул деньги. Меняет расчёты с поставщиком.",
  "Взнос собственника": "Увеличивает капитал. В ОПиУ не попадает.",
  "Получение займа": "Появляется обязательство «Займы». В ОПиУ не попадает.",
  "Прочее поступление": "Прочий доход в ОПиУ.",
  "Оплата поставщику": "Уменьшает долг перед поставщиком. В ОПиУ не попадает — материалы уходят в себестоимость при списании.",
  "Операционные расходы": "Расход периода в ОПиУ по выбранной статье.",
  "Зарплата сотрудникам": "Расход периода в ОПиУ.",
  "Покупка имущества": "Становится имуществом в балансе и амортизируется 60 месяцев.",
  "Возврат покупателю": "Возврат денег дилеру. Увеличивает его долг или уменьшает аванс.",
  "Возврат займа": "Уменьшает обязательство «Займы». В ОПиУ не попадает.",
  "Выплата дивидендов": "Уменьшает капитал. В ОПиУ не попадает.",
  "Прочие расходы": "Прочий расход в ОПиУ.",
};
