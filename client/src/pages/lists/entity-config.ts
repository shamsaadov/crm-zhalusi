export type ListEntity =
  | "colors"
  | "fabrics"
  | "dealers"
  | "cashboxes"
  | "systems"
  | "expenseTypes"
  | "components"
  | "multipliers"
  | "suppliers";

export const entityConfig: Record<
  ListEntity,
  { label: string; apiPath: string; plural: string }
> = {
  colors: { label: "Цвета", apiPath: "/api/colors", plural: "цветов" },
  fabrics: { label: "Ткани", apiPath: "/api/fabrics", plural: "тканей" },
  dealers: { label: "Дилеры", apiPath: "/api/dealers", plural: "дилеров" },
  cashboxes: { label: "Кассы", apiPath: "/api/cashboxes", plural: "касс" },
  systems: { label: "Системы", apiPath: "/api/systems", plural: "систем" },
  expenseTypes: {
    label: "Виды расходов",
    apiPath: "/api/expense-types",
    plural: "видов расходов",
  },
  components: {
    label: "Комплектующие",
    apiPath: "/api/components",
    plural: "комплектующих",
  },
  multipliers: {
    label: "Множители",
    apiPath: "/api/multipliers",
    plural: "множителей",
  },
  suppliers: {
    label: "Поставщики",
    apiPath: "/api/suppliers",
    plural: "поставщиков",
  },
};


