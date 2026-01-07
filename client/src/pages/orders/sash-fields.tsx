import { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X, Info, AlertTriangle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { CONTROL_SIDES, type Fabric } from "@shared/schema";
import type { OrderFormValues } from "./schemas";
import type { SystemWithComponents, FabricWithStock } from "./types";

interface SashFieldsProps {
  index: number;
  form: UseFormReturn<OrderFormValues>;
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  fabricStock: FabricWithStock[];
  fieldsLength: number;
  fieldId: string;
  onRemove: (index: number) => void;
  isCalculating?: boolean;
}

export function SashFields({
  index,
  form,
  systems,
  fabrics,
  fabricStock,
  fieldsLength,
  fieldId,
  onRemove,
  isCalculating = false,
}: SashFieldsProps) {
  const selectedSystem = systems.find(
    (s) => s.id === form.watch(`sashes.${index}.systemId`)
  );
  const currentWidth = form.watch(`sashes.${index}.width`);
  const currentHeight = form.watch(`sashes.${index}.height`);
  const currentFabricId = form.watch(`sashes.${index}.fabricId`);
  const currentSashPrice = form.watch(`sashes.${index}.sashPrice`);
  const currentSashCost = form.watch(`sashes.${index}.sashCost`);
  const currentCoefficient = form.watch(`sashes.${index}.coefficient`); // Коэффициент из файла
  // isCalculating теперь передаётся как prop
  const currentFabric = fabrics.find((f) => f.id === currentFabricId);
  const selectedFabricInfo = fabricStock.find((f) => f.id === currentFabricId);

  const widthM = parseFloat(currentWidth || "0") / 1000;
  const heightM = parseFloat(currentHeight || "0") / 1000;
  const sashPriceNum = parseFloat(currentSashPrice || "0");
  const coefficientNum = parseFloat(currentCoefficient || "0"); // Коэффициент из coefficients.json

  // Проверяем, есть ли все данные для расчета, но цена равна 0 (система не найдена)
  const hasAllData =
    currentWidth &&
    currentHeight &&
    currentFabricId &&
    selectedSystem?.systemKey;
  const isSystemMissing =
    hasAllData && widthM > 0 && heightM > 0 && sashPriceNum === 0;

  return (
    <div
      key={fieldId}
      className={`flex items-end gap-2 p-3 border rounded-lg ${
        isSystemMissing
          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
          : "bg-muted/30"
      }`}
    >
      <div className="flex flex-col items-center gap-1 pb-2 min-w-[50px]">
        <span className="text-sm font-medium text-muted-foreground">
          {index + 1}.
        </span>
      </div>
      <FormField
        control={form.control}
        name={`sashes.${index}.width`}
        render={({ field }) => (
          <FormItem className="min-w-[60px] max-w-[80px]">
            <FormLabel className="text-xs">Ширина</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                placeholder="мм"
                className="h-9"
                {...field}
                data-testid={`input-sash-width-${index}`}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.height`}
        render={({ field }) => (
          <FormItem className="min-w-[60px] max-w-[80px]">
            <FormLabel className="text-xs">Высота</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                placeholder="мм"
                className="h-9"
                {...field}
                data-testid={`input-sash-height-${index}`}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.quantity`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[60px] max-w-[80px]">
            <FormLabel className="text-xs">Кол-во</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="шт"
                className="h-9"
                {...field}
                data-testid={`input-sash-quantity-${index}`}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.systemId`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[120px]">
            <FormLabel className="text-xs flex items-center gap-1">
              Система
              {field.value && selectedSystem && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-4 w-4"
                      type="button"
                    >
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">{selectedSystem.name}</p>
                      {selectedSystem.systemKey && (
                        <p className="text-muted-foreground">
                          Ключ: {selectedSystem.systemKey}
                        </p>
                      )}
                      <Separator />
                      <div>
                        <p className="text-muted-foreground">Комплектующие</p>
                        <p className="font-medium">
                          {selectedSystem.components?.length || 0} шт.
                        </p>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-muted-foreground">
                          Параметры расчёта
                        </p>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          <p className="text-xs">
                            Ширина: {widthM.toFixed(2)} м
                          </p>
                          <p className="text-xs">
                            Высота: {heightM.toFixed(2)} м
                          </p>
                          <p className="text-xs">
                            Категория: {currentFabric?.category || "—"}
                          </p>
                          <p className="text-xs">
                            Площадь: {(widthM * heightM).toFixed(2)} м²
                          </p>
                        </div>
                      </div>
                      {sashPriceNum > 0 && (
                        <>
                          <Separator />
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-muted-foreground text-xs">
                              Расчётная цена створки
                            </p>
                            <p className="font-bold text-lg text-primary">
                              {formatCurrency(sashPriceNum)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </FormLabel>
            <SearchableSelect
              options={systems.map((system) => ({
                value: system.id,
                label: system.name,
              }))}
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Система"
              searchPlaceholder="Поиск системы..."
              emptyText="Система не найдена"
              className="h-9"
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.fabricId`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[120px]">
            <FormLabel className="text-xs flex items-center gap-1">
              Ткань
              {field.value && selectedFabricInfo?.stock && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-4 w-4"
                      type="button"
                    >
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="start">
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">{selectedFabricInfo.name}</p>
                      {selectedFabricInfo.category && (
                        <p className="text-muted-foreground">
                          Категория: {selectedFabricInfo.category}
                        </p>
                      )}
                      <Separator />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-muted-foreground">Остаток</p>
                          <p className="font-medium">
                            {(selectedFabricInfo.stock.quantity ?? 0).toFixed(
                              2
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </FormLabel>
            <SearchableSelect
              options={fabrics.map((fabric) => ({
                value: fabric.id,
                label: fabric.name,
              }))}
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Ткань"
              searchPlaceholder="Поиск ткани..."
              emptyText="Ткань не найдена"
              className="h-9"
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.controlSide`}
        render={({ field }) => (
          <FormItem className="min-w-[55px] max-w-[70px]">
            <FormLabel className="text-xs">Упр.</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CONTROL_SIDES.map((side) => (
                  <SelectItem key={side} value={side}>
                    {side}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.coefficient`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[80px] max-w-[100px]">
            <FormLabel className="text-xs">Коэфф.</FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  type="text"
                  {...field}
                  className="h-9 bg-blue-50 dark:bg-blue-950/20 font-semibold text-blue-700 dark:text-blue-400 pr-8"
                  readOnly
                  placeholder={isCalculating ? "..." : "—"}
                  title="Коэффициент из файла coefficients.json"
                />
                {isCalculating && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            </FormControl>
          </FormItem>
        )}
      />
      {fieldsLength > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onRemove(index)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
