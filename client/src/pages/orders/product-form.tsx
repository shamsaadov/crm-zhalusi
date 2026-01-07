import { useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, X, Check, Wallet } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { ORDER_STATUSES, type Dealer, type Cashbox } from "@shared/schema";
import type { ProductFormValues } from "./schemas";
import type { ComponentWithStock } from "./types";

interface ProductFormProps {
  form: UseFormReturn<ProductFormValues>;
  fieldArray: UseFieldArrayReturn<ProductFormValues, "components">;
  dealers: (Dealer & { balance: number })[];
  componentStock: ComponentWithStock[];
  cashboxes: Cashbox[];
  isPending: boolean;
  onSubmit: (data: ProductFormValues) => void;
  onCancel: () => void;
}

export function ProductForm({
  form,
  fieldArray,
  dealers,
  componentStock,
  cashboxes,
  isPending,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const { fields, append, remove } = fieldArray;
  const [isPaidPopoverOpen, setIsPaidPopoverOpen] = useState(false);

  const isPaid = form.watch("isPaid");
  const selectedCashboxId = form.watch("cashboxId");
  const selectedCashbox = cashboxes.find((c) => c.id === selectedCashboxId);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid grid-cols-3 gap-3 flex-1">
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
              render={({ field }) => {
                const selectedDealer = dealers.find(
                  (d) => d.id === field.value
                );
                return (
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
                    {selectedDealer && (
                      <p
                        className={`text-sm font-medium ${
                          selectedDealer.balance < 0
                            ? "text-red-600 dark:text-red-400"
                            : selectedDealer.balance > 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        Долг:{" "}
                        {selectedDealer.balance < 0
                          ? formatCurrency(Math.abs(selectedDealer.balance))
                          : selectedDealer.balance > 0
                          ? `Переплата ${formatCurrency(
                              selectedDealer.balance
                            )}`
                          : "0"}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
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

          {/* Компактная кнопка "Оплачено" в правом верхнем углу */}
          <div className="pt-6">
            <Popover
              open={isPaidPopoverOpen}
              onOpenChange={setIsPaidPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={isPaid ? "default" : "outline"}
                  size="sm"
                  className={`gap-1.5 ${
                    isPaid ? "bg-green-600 hover:bg-green-700" : ""
                  }`}
                >
                  {isPaid ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Wallet className="h-3.5 w-3.5" />
                  )}
                  {isPaid
                    ? selectedCashbox
                      ? selectedCashbox.name
                      : "Оплачено"
                    : "Оплата"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Выберите кассу для оплаты
                  </p>
                  <FormField
                    control={form.control}
                    name="cashboxId"
                    render={({ field }) => (
                      <Select
                        value={field.value || ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("isPaid", true);
                          setIsPaidPopoverOpen(false);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Выберите кассу" />
                        </SelectTrigger>
                        <SelectContent>
                          {cashboxes.map((cashbox) => (
                            <SelectItem key={cashbox.id} value={cashbox.id}>
                              {cashbox.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {isPaid && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        form.setValue("isPaid", false);
                        form.setValue("cashboxId", "");
                        setIsPaidPopoverOpen(false);
                      }}
                    >
                      Отменить оплату
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
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
                            }) — ост: ${(
                              component.stock?.quantity ?? 0
                            ).toFixed(1)}`,
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
                {selectedComponent && selectedComponent.stock && (
                  <div className="flex flex-col text-xs text-muted-foreground pb-2">
                    <span className="font-medium text-foreground">
                      Сумма:{" "}
                      {formatCurrency(
                        (selectedComponent.stock.avgPrice ?? 0) *
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
