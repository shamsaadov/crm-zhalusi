import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ruler, Package, Scissors, Info, Save } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import type { CostCalculationDetails } from "./types";

export interface FabricPriceOverride {
  fabricId: string;
  price: number;
}

interface CostCalculationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: CostCalculationDetails | null;
  onCostUpdate?: (
    newCostPrice: number,
    fabricOverrides: FabricPriceOverride[]
  ) => void;
}

export function CostCalculationDialog({
  open,
  onOpenChange,
  details,
  onCostUpdate,
}: CostCalculationDialogProps) {
  // Локальные переопределения цен тканей: ключ — fabricName-fabricType, значение — цена за м²
  const [fabricPriceOverrides, setFabricPriceOverrides] = useState<
    Map<string, number>
  >(new Map());

  // Локальные переопределения для комплектующих: ключ — name, значение — { price, quantity }
  const [componentOverrides, setComponentOverrides] = useState<
    Map<string, { price?: number; quantity?: number }>
  >(new Map());

  // Сбрасываем overrides при открытии диалога с новыми данными
  useEffect(() => {
    if (open && details) {
      setFabricPriceOverrides(new Map());
      setComponentOverrides(new Map());
    }
  }, [open, details?.totalCost]);

  // Расчёт общей статистики
  const totalSashes =
    details?.sashDetails.reduce((sum, s) => sum + s.quantity, 0) || 0;
  const totalArea =
    details?.sashDetails.reduce((sum, s) => {
      const area = (s.width / 100) * (s.height / 100) * s.quantity;
      return sum + area;
    }, 0) || 0;
  const totalLinearMeters =
    details?.sashDetails.reduce((sum, s) => {
      const perimeter = ((s.width + s.height) * 2) / 100;
      return sum + perimeter * s.quantity;
    }, 0) || 0;

  // Группировка тканей с ценами.
  // Ключ — fabricId (чтобы сохранить цену в БД), для строк без id
  // (мобильные заказы без привязки к справочнику) ключ — fabricName-fabricType.
  const allFabrics = useMemo(() => {
    const map = new Map<
      string,
      {
        fabricId: string | null;
        name: string;
        type: string;
        totalArea: number;
        avgPrice: number;
        totalCost: number;
      }
    >();
    details?.sashDetails.forEach((sash) => {
      if (sash.fabricName) {
        const key = sash.fabricId ?? `${sash.fabricName}-${sash.fabricType}`;
        const baseArea =
          (sash.width / 100) * (sash.height / 100) * sash.quantity;
        const area = baseArea * (sash.fabricMultiplier || 1);
        const existing = map.get(key);
        if (existing) {
          existing.totalArea += area;
          existing.totalCost += sash.fabricCost * sash.quantity;
        } else {
          map.set(key, {
            fabricId: sash.fabricId,
            name: sash.fabricName,
            type: sash.fabricType,
            totalArea: area,
            avgPrice: sash.fabricAvgPrice,
            totalCost: sash.fabricCost * sash.quantity,
          });
        }
      }
    });
    return map;
  }, [details]);

  // Группировка комплектующих с ценами
  const allComponents = useMemo(() => {
    const map = new Map<
      string,
      { name: string; unit: string; totalQty: number; avgPrice: number; totalCost: number }
    >();
    details?.sashDetails.forEach((sash) => {
      sash.componentsDetails.forEach((comp) => {
        const key = comp.name;
        const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
          comp.unit.toLowerCase()
        );
        const componentQty = isMetric
          ? comp.sizeValue * comp.sizeMultiplier * comp.quantity * sash.quantity
          : comp.quantity * sash.quantity;

        const existing = map.get(key);
        if (existing) {
          existing.totalQty += componentQty;
          existing.totalCost += comp.totalPrice * sash.quantity;
        } else {
          map.set(key, {
            name: comp.name,
            unit: comp.unit,
            totalQty: componentQty,
            avgPrice: comp.avgPrice,
            totalCost: comp.totalPrice * sash.quantity,
          });
        }
      });
    });
    return map;
  }, [details]);

  // Пересчёт себестоимости с учётом overrides
  const recalculatedCost = useMemo(() => {
    if (!details) return 0;

    let totalCost = 0;

    for (const sash of details.sashDetails) {
      let sashCost = 0;

      // Ткань
      if (sash.fabricName) {
        const fabricKey = sash.fabricId ?? `${sash.fabricName}-${sash.fabricType}`;
        const overridePrice = fabricPriceOverrides.get(fabricKey);
        const price = overridePrice !== undefined ? overridePrice : sash.fabricAvgPrice;
        const areaM2 = (sash.width / 100) * (sash.height / 100);
        sashCost += areaM2 * price * (sash.fabricMultiplier || 1);
      }

      // Комплектующие
      for (const comp of sash.componentsDetails) {
        const override = componentOverrides.get(comp.name);
        const price = override?.price !== undefined ? override.price : comp.avgPrice;
        const quantity = override?.quantity !== undefined ? override.quantity : comp.quantity;

        const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
          comp.unit.toLowerCase()
        );

        if (isMetric) {
          sashCost += price * comp.sizeValue * comp.sizeMultiplier * quantity;
        } else {
          sashCost += price * quantity;
        }
      }

      // Фиксированная надбавка
      sashCost += sash.sashFixedCost;

      totalCost += sashCost * sash.quantity;
    }

    return totalCost;
  }, [details, fabricPriceOverrides, componentOverrides]);

  const hasOverrides = fabricPriceOverrides.size > 0 || componentOverrides.size > 0;
  const originalCost = details?.totalCost || 0;
  const costDiff = recalculatedCost - originalCost;

  const handleSave = () => {
    if (onCostUpdate) {
      // Собираем только ткани с id — их цену можно сохранить в справочник.
      // Overrides по строковому ключу (ткань без fabricId) уйдут только в расчёт.
      const fabricOverridesPayload: FabricPriceOverride[] = [];
      Array.from(fabricPriceOverrides.entries()).forEach(([key, price]) => {
        const entry = allFabrics.get(key);
        if (entry?.fabricId) {
          fabricOverridesPayload.push({ fabricId: entry.fabricId, price });
        }
      });
      onCostUpdate(recalculatedCost, fabricOverridesPayload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Подробности заказа
          </DialogTitle>
        </DialogHeader>
        {details && (
          <div className="space-y-4">
            {/* Общая сводка */}
            <div className="flex flex-wrap items-center gap-4 py-1.5 px-3 bg-muted/50 rounded-lg text-sm">
              <div className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Створок:</span>
                <span className="font-semibold">{totalSashes}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Площадь:</span>
                <span className="font-semibold">{totalArea.toFixed(2)} м²</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Пог.м:</span>
                <span className="font-semibold">{totalLinearMeters.toFixed(2)} м</span>
              </div>
            </div>

            {/* Ткани */}
            {allFabrics.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Ткани</span>
                </div>
                <div className="space-y-2">
                  {Array.from(allFabrics.entries()).map(([key, fabric]) => {
                    const overridePrice = fabricPriceOverrides.get(key);
                    const currentPrice = overridePrice !== undefined ? overridePrice : fabric.avgPrice;

                    return (
                      <div
                        key={key}
                        className="text-sm py-1 px-2 bg-muted/30 rounded space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{fabric.name}</span>
                            {fabric.type === "zebra" && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                зебра
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground">
                            {fabric.totalArea.toFixed(2)} м²
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Цена/м²:</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={currentPrice || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              const newMap = new Map(fabricPriceOverrides);
                              if (!isNaN(val)) {
                                newMap.set(key, val);
                              } else {
                                newMap.delete(key);
                              }
                              setFabricPriceOverrides(newMap);
                            }}
                            className="h-7 w-28 text-xs"
                          />
                          {overridePrice !== undefined && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300">
                              изм.
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Separator />

            {/* Комплектующие */}
            {allComponents.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Комплектующие</span>
                  <Badge variant="outline" className="text-[10px]">
                    {allComponents.size}
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {Array.from(allComponents.entries()).map(([key, comp]) => {
                    const override = componentOverrides.get(key);
                    const currentPrice = override?.price !== undefined ? override.price : comp.avgPrice;
                    const currentQty = override?.quantity !== undefined ? override.quantity : comp.totalQty;
                    const isOverridden = override?.price !== undefined || override?.quantity !== undefined;

                    const lineTotal = (() => {
                      const isMetric = ["м", "пм", "п.м.", "м.п."].includes(comp.unit.toLowerCase());
                      if (isMetric) return currentPrice * currentQty;
                      return currentPrice * currentQty;
                    })();

                    return (
                      <div
                        key={key}
                        className="text-sm py-1 px-2 bg-muted/30 rounded space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{comp.name}</span>
                            {isOverridden && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300">
                                изм.
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {currentQty.toFixed(2)} × {currentPrice.toFixed(2)} = {formatCurrency(lineTotal)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Кол-во:</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={currentQty || ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const newMap = new Map(componentOverrides);
                                const existing = newMap.get(key) || {};
                                if (!isNaN(val)) {
                                  newMap.set(key, { ...existing, quantity: val });
                                } else {
                                  const { quantity: _, ...rest } = existing;
                                  if (Object.keys(rest).length > 0) {
                                    newMap.set(key, rest);
                                  } else {
                                    newMap.delete(key);
                                  }
                                }
                                setComponentOverrides(newMap);
                              }}
                              className="h-7 w-20 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">{comp.unit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Цена:</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={currentPrice || ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const newMap = new Map(componentOverrides);
                                const existing = newMap.get(key) || {};
                                if (!isNaN(val)) {
                                  newMap.set(key, { ...existing, price: val });
                                } else {
                                  const { price: _, ...rest } = existing;
                                  if (Object.keys(rest).length > 0) {
                                    newMap.set(key, rest);
                                  } else {
                                    newMap.delete(key);
                                  }
                                }
                                setComponentOverrides(newMap);
                              }}
                              className="h-7 w-24 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {details.sashDetails.length === 0 && (
              <p className="text-muted-foreground text-center text-sm py-4">
                Заполните ширину, высоту, ткань и систему для створок
              </p>
            )}

            {/* Итого */}
            {details.sashDetails.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1 px-2">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-sm font-medium">Себестоимость:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">
                        {formatCurrency(recalculatedCost)}
                      </span>
                      {hasOverrides && costDiff !== 0 && (
                        <span className={`text-xs ${costDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          ({costDiff > 0 ? '+' : ''}{formatCurrency(costDiff)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-muted-foreground">Без ЗП (−150 × {totalSashes}):</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(recalculatedCost - 150 * totalSashes)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {onCostUpdate && hasOverrides && (
            <Button size="sm" onClick={handleSave} className="gap-1">
              <Save className="h-4 w-4" />
              Сохранить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
