import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ruler, Package, Scissors, Info } from "lucide-react";
import type { CostCalculationDetails } from "./types";

interface CostCalculationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: CostCalculationDetails | null;
}

export function CostCalculationDialog({
  open,
  onOpenChange,
  details,
}: CostCalculationDialogProps) {
  // Расчёт общей статистики
  const totalSashes =
    details?.sashDetails.reduce((sum, s) => sum + s.quantity, 0) || 0;
  const totalArea =
    details?.sashDetails.reduce((sum, s) => {
      const area = (s.width / 1000) * (s.height / 1000) * s.quantity;
      return sum + area;
    }, 0) || 0;

  // Группировка комплектующих по всем створкам
  const allComponents = new Map<
    string,
    { name: string; unit: string; totalQty: number }
  >();
  details?.sashDetails.forEach((sash) => {
    sash.componentsDetails.forEach((comp) => {
      const key = comp.name;
      const existing = allComponents.get(key);
      if (existing) {
        existing.totalQty += comp.quantity * sash.quantity;
      } else {
        allComponents.set(key, {
          name: comp.name,
          unit: comp.unit,
          totalQty: comp.quantity * sash.quantity,
        });
      }
    });
  });

  // Группировка тканей
  const allFabrics = new Map<
    string,
    { name: string; type: string; totalArea: number }
  >();
  details?.sashDetails.forEach((sash) => {
    if (sash.fabricName) {
      const key = `${sash.fabricName}-${sash.fabricType}`;
      const area = (sash.width / 1000) * (sash.height / 1000) * sash.quantity;
      const existing = allFabrics.get(key);
      if (existing) {
        existing.totalArea += area;
      } else {
        allFabrics.set(key, {
          name: sash.fabricName,
          type: sash.fabricType,
          totalArea: area,
        });
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Подробности заказа
          </DialogTitle>
        </DialogHeader>
        {details && (
          <div className="space-y-4">
            {/* Общая сводка */}
            <div className="flex items-center gap-6 py-2 px-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Створок:</span>
                <span className="font-semibold">{totalSashes}</span>
              </div>
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Площадь:</span>
                <span className="font-semibold">{totalArea.toFixed(2)} м²</span>
              </div>
            </div>

            {/* Ткани */}
            {allFabrics.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Ткани</span>
                </div>
                <div className="space-y-1.5">
                  {Array.from(allFabrics.values()).map((fabric, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm py-1 px-2 bg-muted/30 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <span>{fabric.name}</span>
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
                  ))}
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
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {Array.from(allComponents.values()).map((comp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm py-1 px-2 bg-muted/30 rounded"
                    >
                      <span>{comp.name}</span>
                      <span className="text-muted-foreground">
                        {comp.totalQty % 1 === 0
                          ? comp.totalQty
                          : comp.totalQty.toFixed(2)}{" "}
                        {comp.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {details.sashDetails.length === 0 && (
              <p className="text-muted-foreground text-center text-sm py-4">
                Заполните ширину, высоту, ткань и систему для створок
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
