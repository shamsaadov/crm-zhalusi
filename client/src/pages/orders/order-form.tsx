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
import { Plus, Loader2 } from "lucide-react";
import { ORDER_STATUSES, type Dealer, type Fabric, type Color } from "@shared/schema";
import type { OrderFormValues } from "./schemas";
import type {
  SystemWithComponents,
  FabricWithStock,
  ComponentWithStock,
  CostCalculationDetails,
} from "./types";
import { SashFields } from "./sash-fields";
import { calculateCostPrice } from "./utils";

interface OrderFormProps {
  form: UseFormReturn<OrderFormValues>;
  fieldArray: UseFieldArrayReturn<OrderFormValues, "sashes">;
  dealers: Dealer[];
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  colors: Color[];
  fabricStock: FabricWithStock[];
  componentStock: ComponentWithStock[];
  isEditing: boolean;
  isPending: boolean;
  onSubmit: (data: OrderFormValues) => void;
  onCancel: () => void;
  onShowCostCalculation: (details: CostCalculationDetails) => void;
}

export function OrderForm({
  form,
  fieldArray,
  dealers,
  systems,
  fabrics,
  colors,
  fabricStock,
  componentStock,
  isEditing,
  isPending,
  onSubmit,
  onCancel,
  onShowCostCalculation,
}: OrderFormProps) {
  const { fields, append, remove } = fieldArray;

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
              Створки
              <Badge variant="secondary" className="ml-2">
                {fields.length}
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
              colors={colors}
              fabricStock={fabricStock}
              fieldsLength={fields.length}
              fieldId={field.id}
              onRemove={remove}
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
                systemId: firstSash?.systemId || "",
                systemColorId: firstSash?.systemColorId || "",
                controlSide: "",
                fabricId: firstSash?.fabricId || "",
                fabricColorId: firstSash?.fabricColorId || "",
                sashPrice: "",
                sashCost: "",
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
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена продажи (авто)</FormLabel>
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
                  Коэффициент × множитель системы
                </p>
                <FormMessage />
              </FormItem>
            )}
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

