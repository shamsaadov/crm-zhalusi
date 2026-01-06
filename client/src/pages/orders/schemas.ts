import { z } from "zod";

export const sashSchema = z.object({
  width: z.string().min(1, "Обязательное поле"),
  height: z.string().min(1, "Обязательное поле"),
  quantity: z.string().min(1, "Обязательное поле").default("1"),
  systemId: z.string().optional(),
  controlSide: z.string().optional(),
  fabricId: z.string().optional(),
  sashPrice: z.string().optional(),
  sashCost: z.string().optional(),
});

export const orderFormSchema = z.object({
  date: z.string().min(1, "Обязательное поле"),
  dealerId: z.string().optional(),
  status: z.string().default("Новый"),
  salePrice: z.string().optional(),
  costPrice: z.string().optional(),
  comment: z.string().optional(),
  isPaid: z.boolean().optional().default(false),
  sashes: z.array(sashSchema).min(1, "Добавьте минимум одну створку"),
});

export const productComponentSchema = z.object({
  componentId: z.string().min(1, "Выберите комплектующую"),
  quantity: z.string().min(1, "Укажите количество"),
});

export const productFormSchema = z.object({
  date: z.string().min(1, "Обязательное поле"),
  dealerId: z.string().optional(),
  status: z.string().default("Новый"),
  salePrice: z.string().optional(),
  costPrice: z.string().optional(),
  comment: z.string().optional(),
  isPaid: z.boolean().optional().default(false),
  components: z
    .array(productComponentSchema)
    .min(1, "Добавьте минимум одну комплектующую"),
});

export type SashFormValues = z.infer<typeof sashSchema>;
export type OrderFormValues = z.infer<typeof orderFormSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;

