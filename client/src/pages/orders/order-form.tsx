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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Pencil, RotateCcw, FileText } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { ORDER_STATUSES, type Dealer, type Fabric } from "@shared/schema";
import type { OrderFormValues } from "./schemas";
import type {
  SystemWithComponents,
  FabricWithStock,
  ComponentWithStock,
  CostCalculationDetails,
} from "./types";
import { SashFields } from "./sash-fields";
import { calculateCostPrice, printInvoicePreview } from "./utils";

interface OrderFormProps {
  form: UseFormReturn<OrderFormValues>;
  fieldArray: UseFieldArrayReturn<OrderFormValues, "sashes">;
  dealers: (Dealer & { balance: number })[];
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  fabricStock: FabricWithStock[];
  componentStock: ComponentWithStock[];
  isEditing: boolean;
  isPending: boolean;
  onSubmit: (data: OrderFormValues) => void;
  onCancel: () => void;
  onShowCostCalculation: (details: CostCalculationDetails) => void;
  onSashRemove?: (index: number) => void;
}

export function OrderForm({
  form,
  fieldArray,
  dealers,
  systems,
  fabrics,
  fabricStock,
  componentStock,
  isEditing,
  isPending,
  onSubmit,
  onCancel,
  onShowCostCalculation,
  onSashRemove,
}: OrderFormProps) {
  const { fields, append, remove } = fieldArray;
  const [isSalePriceEditable, setIsSalePriceEditable] = useState(false);
  const [autoSalePrice, setAutoSalePrice] = useState<string | null>(null);

  const handleSashRemove = (index: number) => {
    // Вызываем callback для очистки состояния калькулятора
    onSashRemove?.(index);
    // Удаляем створку из массива
    remove(index);
  };

  const handleTestCalculation = () => {
    const sashes = form.getValues("sashes");
    const { totalCost, sashDetails } = calculateCostPrice(
      sashes,
      (i) => form.getValues(`sashes.${i}`),
      fabricStock,
      componentStock,
      systems
    );
    onShowCostCalculation({ totalCost, sashDetails });
  };

  const handleInvoicePreview = () => {
    const formData = form.getValues();
    const selectedDealer = dealers.find((d) => d.id === formData.dealerId);

    printInvoicePreview({
      date: formData.date,
      dealerName: selectedDealer?.fullName || "Не указан",
      sashes: formData.sashes,
      salePrice: formData.salePrice || "0",
      comment: formData.comment,
    });
  };

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
            render={({ field }) => {
              const selectedDealer = dealers.find((d) => d.id === field.value);
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
                        ? `Переплата ${formatCurrency(selectedDealer.balance)}`
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

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Створки
              <Badge variant="secondary" className="ml-2">
                {fields.length} {fields.length !== 1 ? "позиций" : "позиция"}
              </Badge>
              <Badge variant="outline" className="ml-2">
                {fields.reduce((total, _, index) => {
                  const quantity = parseFloat(
                    form.watch(`sashes.${index}.quantity`) || "1"
                  );
                  return total + quantity;
                }, 0)}{" "}
                шт
              </Badge>
            </h3>
          </div>

          {fields.map((field, index) => (
            <SashFields
              key={field.id}
              index={index}
              form={form}
              systems={systems}
              fabrics={fabrics}
              fabricStock={fabricStock}
              fieldsLength={fields.length}
              fieldId={field.id}
              onRemove={handleSashRemove}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              const firstSash = form.getValues("sashes.0");
              append({
                width: "",
                height: "",
                quantity: "1",
                systemId: firstSash?.systemId || "",
                controlSide: "",
                fabricId: firstSash?.fabricId || "",
                sashPrice: "",
                sashCost: "",
                coefficient: "",
                isCalculating: false,
              });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить створку
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="salePrice"
            render={({ field }) => {
              // Рассчитываем сумму коэффициентов из файла по всем створкам (с учетом количества)
              const sashes = form.watch("sashes") || [];
              const totalCoefficient = sashes.reduce((sum, sash) => {
                const coefficient = parseFloat(sash.coefficient || "0");
                const quantity = parseFloat(sash.quantity || "1");
                return sum + coefficient * quantity;
              }, 0);

              return (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Цена продажи{" "}
                    {isSalePriceEditable ? "(ручной ввод)" : "(авто)"}
                    {!isSalePriceEditable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setAutoSalePrice(field.value || "");
                          setIsSalePriceEditable(true);
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Изменить
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          if (autoSalePrice !== null) {
                            field.onChange(autoSalePrice);
                          }
                          setIsSalePriceEditable(false);
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Сбросить
                      </Button>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      {...field}
                      className={isSalePriceEditable ? "" : "bg-muted"}
                      readOnly={!isSalePriceEditable}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {isSalePriceEditable
                        ? "Введите свою цену (скидка/наценка)"
                        : "Сумма коэффициентов × множитель"}
                    </p>
                    {totalCoefficient > 0 && (
                      <Badge
                        variant="default"
                        className="text-xs font-semibold"
                        title="Сумма всех коэффициентов из файла coefficients.json (с учетом количества створок)"
                      >
                        Σ К: {totalCoefficient.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          <FormField
            control={form.control}
            name="costPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Себестоимость (авто)
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={handleTestCalculation}
                  >
                    🧪 Тест расчета
                  </Button>
                </FormLabel>
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
                  Ткань (площадь × ср. цена × множитель) + комплектующие
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

        <FormField
          control={form.control}
          name="isPaid"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="cursor-pointer">Оплачено</FormLabel>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleInvoicePreview}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Предпросмотр накладной
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
