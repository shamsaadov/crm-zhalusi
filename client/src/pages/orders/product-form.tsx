import { UseFormReturn, UseFieldArrayReturn } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, X } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { ORDER_STATUSES, type Dealer } from "@shared/schema";
import type { ProductFormValues } from "./schemas";
import type { ComponentWithStock } from "./types";

interface ProductFormProps {
  form: UseFormReturn<ProductFormValues>;
  fieldArray: UseFieldArrayReturn<ProductFormValues, "components">;
  dealers: Dealer[];
  componentStock: ComponentWithStock[];
  isPending: boolean;
  onSubmit: (data: ProductFormValues) => void;
  onCancel: () => void;
}

export function ProductForm({
  form,
  fieldArray,
  dealers,
  componentStock,
  isPending,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const { fields, append, remove } = fieldArray;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дата</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dealerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Дилер</FormLabel>
                <SearchableSelect
                  options={dealers.map((dealer) => ({
                    value: dealer.id,
                    label: dealer.fullName,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Выберите дилера"
                  searchPlaceholder="Поиск дилера..."
                  emptyText="Дилер не найден"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Статус</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Комплектующие
              <Badge variant="secondary" className="ml-2">
                {fields.length}
              </Badge>
            </h3>
          </div>

          {fields.map((field, index) => {
            const selectedComponentId = form.watch(
              `components.${index}.componentId`
            );
            const selectedComponent = componentStock.find(
              (c) => c.id === selectedComponentId
            );

            return (
              <div
                key={field.id}
                className="flex items-end gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <span className="text-sm font-medium text-muted-foreground pb-2 min-w-[24px]">
                  {index + 1}.
                </span>
                <FormField
                  control={form.control}
                  name={`components.${index}.componentId`}
                  render={({ field }) => (
                    <FormItem className="flex-[3]">
                      <FormLabel className="text-xs">Комплектующая</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={componentStock.map((component) => ({
                            value: component.id,
                            label: component.name,
                            secondaryLabel: `(${
                              component.unit || "шт"
                            }) — ост: ${component.stock.quantity.toFixed(1)}`,
                          }))}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Выберите комплектующую"
                          searchPlaceholder="Поиск комплектующей..."
                          emptyText="Комплектующая не найдена"
                          className="h-9"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`components.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[100px]">
                      <FormLabel className="text-xs">
                        Количество{" "}
                        {selectedComponent?.unit
                          ? `(${selectedComponent.unit})`
                          : ""}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Кол-во"
                          className="h-9"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedComponent && (
                  <div className="flex flex-col text-xs text-muted-foreground pb-2">
                    <span>
                      Ср. цена:{" "}
                      {formatCurrency(selectedComponent.stock.avgPrice)}
                    </span>
                    <span className="font-medium text-foreground">
                      Сумма:{" "}
                      {formatCurrency(
                        selectedComponent.stock.avgPrice *
                          parseFloat(
                            form.watch(`components.${index}.quantity`) || "0"
                          )
                      )}
                    </span>
                  </div>
                )}
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => remove(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              append({
                componentId: "",
                quantity: "1",
              });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить комплектующую
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="salePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена продажи</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="costPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Себестоимость</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    className="bg-muted"
                    readOnly
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Сумма по комплектующим × ср. цена
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Комментарий</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Создать
          </Button>
        </div>
      </form>
    </Form>
  );
}

