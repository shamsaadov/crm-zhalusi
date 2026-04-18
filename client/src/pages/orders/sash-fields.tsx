import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { X, Loader2, Pin, Plus, GripVertical } from "lucide-react";
import { CONTROL_SIDES, type Fabric } from "@shared/schema";
import { usePinnedSystems } from "@/hooks/use-pinned-systems";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OrderFormValues } from "./schemas";
import type { SystemWithComponents } from "./types";

interface SashFieldsProps {
  index: number;
  form: UseFormReturn<OrderFormValues>;
  systems: SystemWithComponents[];
  fabrics: Fabric[];
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
  fieldsLength,
  fieldId,
  onRemove,
  isCalculating = false,
}: SashFieldsProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: fieldId,
    data: { index },
  });
  const dragStyle = transform ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined } : undefined;

  const { sortSystems, toggle: togglePin, isPinned } = usePinnedSystems();
  const sortedSystems = sortSystems(systems);
  const [showQuickFabric, setShowQuickFabric] = useState(false);
  const [quickFabricName, setQuickFabricName] = useState("");
  const [quickFabricType, setQuickFabricType] = useState<string>("roll");

  const createFabricMutation = useMutation({
    mutationFn: (data: { name: string; fabricType: string }) =>
      apiRequest("POST", "/api/fabrics", data),
    onSuccess: async (res: any) => {
      const fabric = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      form.setValue(`sashes.${index}.fabricId`, fabric.id);
      setShowQuickFabric(false);
      setQuickFabricName("");
    },
  });

  const selectedSystem = systems.find(
    (s) => s.id === form.watch(`sashes.${index}.systemId`)
  );

  // Фильтрация тканей по типу системы (zebra/roll)
  const currentFabricIdRaw = form.watch(`sashes.${index}.fabricId`);
  const filteredFabrics = (() => {
    if (!selectedSystem?.systemKey) return fabrics;
    const key = selectedSystem.systemKey.toLowerCase();
    const isZebra = key.includes("zebra");
    const isRoller = key.includes("roller") || key.includes("roll");
    if (!isZebra && !isRoller) return fabrics;
    const targetType = isZebra ? "zebra" : "roll";
    const filtered = fabrics.filter((f) => (f.fabricType || "roll") === targetType);
    // Always include the currently selected fabric so pre-filled values are visible
    if (currentFabricIdRaw && !filtered.some((f) => f.id === currentFabricIdRaw)) {
      const selected = fabrics.find((f) => f.id === currentFabricIdRaw);
      if (selected) filtered.push(selected);
    }
    return filtered.length > 0 ? filtered : fabrics;
  })();

  const currentWidth = form.watch(`sashes.${index}.width`);
  const currentHeight = form.watch(`sashes.${index}.height`);
  const currentFabricId = currentFabricIdRaw;
  const currentSashPrice = form.watch(`sashes.${index}.sashPrice`);

  const widthNum = parseFloat(currentWidth || "0");
  const heightNum = parseFloat(currentHeight || "0");
  const widthM = widthNum / 100;
  const heightM = heightNum / 100;
  const sashPriceNum = parseFloat(currentSashPrice || "0");

  const MIN_CM = 10;
  const MAX_CM = 400;
  // Предупреждение — строго внешнее (border + title tooltip). Отдельный <p>
  // под инпутом ломал выравнивание `items-end` в ряду створки: одна колонка
  // становилась выше соседних, и казалось что инпут «не принимает ввод».
  const widthWarning = currentWidth && widthNum > 0 && (widthNum < MIN_CM || widthNum > MAX_CM);
  const heightWarning = currentHeight && heightNum > 0 && (heightNum < MIN_CM || heightNum > MAX_CM);

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
      ref={setNodeRef}
      style={dragStyle}
      className={`flex items-end gap-1.5 py-1.5 px-2 border rounded-lg ${
        isDragging ? "opacity-50 shadow-lg" : ""
      } ${
        isSystemMissing
          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
          : "bg-muted/30"
      }`}
    >
      <div
        className="flex flex-col items-center gap-0.5 pb-1 min-w-[28px] cursor-grab active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{index + 1}</span>
      </div>
      <FormField
        control={form.control}
        name={`sashes.${index}.width`}
        render={({ field }) => (
          <FormItem className="min-w-[60px] max-w-[80px]">
            <FormLabel className={`text-xs ${widthWarning ? "text-orange-600" : ""}`}>Ширина</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="any"
                placeholder="см"
                className={`h-9 ${widthWarning ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""}`}
                title={widthWarning ? `Проверьте размер (${MIN_CM}–${MAX_CM} см)` : undefined}
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
            <FormLabel className={`text-xs ${heightWarning ? "text-orange-600" : ""}`}>Высота</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="any"
                placeholder="см"
                className={`h-9 ${heightWarning ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""}`}
                title={heightWarning ? `Проверьте размер (${MIN_CM}–${MAX_CM} см)` : undefined}
                {...field}
                data-testid={`input-sash-height-${index}`}
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
              {field.value && (
                <button
                  type="button"
                  className="inline-flex"
                  onClick={(e) => { e.stopPropagation(); togglePin(field.value!); }}
                  title={isPinned(field.value!) ? "Открепить" : "Закрепить"}
                >
                  <Pin className={`h-3 w-3 ${isPinned(field.value!) ? "text-blue-500 fill-blue-500" : "text-muted-foreground"}`} />
                </button>
              )}
            </FormLabel>
            <SearchableSelect
              options={sortedSystems.map((system) => ({
                value: system.id,
                label: isPinned(system.id) ? `📌 ${system.name}` : system.name,
              }))}
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Система"
              searchPlaceholder="Поиск системы..."
              emptyText="Система не найдена"
              className="h-8"
            />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`sashes.${index}.fabricId`}
        render={({ field }) => (
          <FormItem className="flex-1 min-w-[120px]">
            <FormLabel className="text-xs">Ткань</FormLabel>
            <div className="flex gap-0.5">
              <div className="flex-1">
                <SearchableSelect
                  options={filteredFabrics.map((fabric) => ({
                    value: fabric.id,
                    label: fabric.name,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Ткань"
                  searchPlaceholder="Поиск ткани..."
                  emptyText="Ткань не найдена"
                  className="h-8"
                />
              </div>
              <Popover open={showQuickFabric} onOpenChange={setShowQuickFabric}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-7 shrink-0" title="Добавить ткань">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Новая ткань</p>
                    <Input
                      placeholder="Название"
                      value={quickFabricName}
                      onChange={(e) => setQuickFabricName(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Select value={quickFabricType} onValueChange={setQuickFabricType}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="roll">Рулонная</SelectItem>
                        <SelectItem value="zebra">Зебра</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={!quickFabricName.trim() || createFabricMutation.isPending}
                      onClick={() => createFabricMutation.mutate({
                        name: quickFabricName.trim(),
                        fabricType: quickFabricType,
                      })}
                    >
                      {createFabricMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
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
                <SelectTrigger className="h-8">
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
                  className="h-8 bg-blue-50 dark:bg-blue-950/20 font-semibold text-blue-700 dark:text-blue-400 pr-8"
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
          className="h-8 w-9 shrink-0"
          onClick={() => onRemove(index)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
