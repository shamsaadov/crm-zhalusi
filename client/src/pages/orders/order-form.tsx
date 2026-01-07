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
import {
  Plus,
  Loader2,
  Pencil,
  RotateCcw,
  FileText,
  Check,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import {
  ORDER_STATUSES,
  type Dealer,
  type Fabric,
  type Cashbox,
} from "@shared/schema";
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
  cashboxes: Cashbox[];
  isEditing: boolean;
  isPending: boolean;
  onSubmit: (data: OrderFormValues) => void;
  onCancel: () => void;
  onShowCostCalculation: (details: CostCalculationDetails) => void;
  onSashRemove?: (index: number) => void;
  calculatingSashes?: Set<number>;
  isManualSalePrice?: boolean;
  onManualSalePriceChange?: (isManual: boolean) => void;
}

export function OrderForm({
  form,
  fieldArray,
  dealers,
  systems,
  fabrics,
  fabricStock,
  componentStock,
  cashboxes,
  isEditing,
  isPending,
  onSubmit,
  onCancel,
  onShowCostCalculation,
  onSashRemove,
  calculatingSashes,
  isManualSalePrice = false,
  onManualSalePriceChange,
}: OrderFormProps) {
  const { fields, append, remove } = fieldArray;
  const [autoSalePrice, setAutoSalePrice] = useState<string | null>(null);
  const [isPaidPopoverOpen, setIsPaidPopoverOpen] = useState(false);
  const [localManualPrice, setLocalManualPrice] = useState(false);
  
  // Используем внешнее состояние если передано, иначе локальное
  const isSalePriceEditable = onManualSalePriceChange ? isManualSalePrice : localManualPrice;
  const setIsSalePriceEditable = (value: boolean) => {
    if (onManualSalePriceChange) {
      onManualSalePriceChange(value);
    } else {
      setLocalManualPrice(value);
    }
  };

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
              isCalculating={calculatingSashes?.has(index) || false}
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
                const coeff = parseFloat(sash.coefficient || "0");
                const qty = parseFloat(sash.quantity || "1");
                return sum + coeff * qty;
              }, 0);

              return (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Цена продажи{" "}
                    {isSalePriceEditable ? "(ручной ввод)" : "(авто)"}
                    {totalCoefficient > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs font-normal text-blue-600 border-blue-300"
                      >
                        Σ коэфф: {totalCoefficient.toFixed(2)}
                      </Badge>
                    )}
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
