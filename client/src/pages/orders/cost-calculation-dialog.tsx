import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/components/status-badge";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🧪 Тест расчета себестоимости</DialogTitle>
        </DialogHeader>
        {details && (
          <div className="space-y-4">
            <Card className="bg-primary/10 border-primary">
              <CardContent className="py-4 space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Общая формула:
                  </p>
                  <p className="font-mono text-sm mt-1">
                    Себестоимость = Ткань + Комплектующие
                  </p>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium">📦 Расчет ткани:</p>
                  <p className="font-mono text-xs mt-1">
                    Площадь(м²) × Цена_ткани × Множитель_типа
                  </p>
                  <ul className="text-sm ml-4 mt-1">
                    <li>
                      • <Badge variant="secondary">Зебра</Badge> → множитель ={" "}
                      <span className="font-bold text-orange-600">2</span>
                    </li>
                    <li>
                      • <Badge variant="outline">Рулон</Badge> → множитель ={" "}
                      <span className="font-bold">1</span>
                    </li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium">
                    🔧 Расчет комплектующих:
                  </p>
                  <ul className="text-sm ml-4 mt-1 space-y-1">
                    <li>
                      • Если единица <Badge variant="outline">м</Badge> /{" "}
                      <Badge variant="outline">пм</Badge>:
                      <p className="font-mono text-xs ml-2">
                        Цена × Размер(ширина/высота) × Множитель × Кол-во
                      </p>
                      <p className="text-xs text-muted-foreground ml-2">
                        (если не указан размер — используется ширина)
                      </p>
                    </li>
                    <li>
                      • Если единица <Badge variant="outline">шт</Badge> или{" "}
                      <Badge variant="outline">упак</Badge>:
                      <p className="font-mono text-xs ml-2">Цена × Кол-во</p>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {details.sashDetails.length === 0 ? (
              <Card>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-center">
                    Нет данных для расчета. Заполните ширину, высоту, ткань и
                    систему для створок.
                  </p>
                </CardContent>
              </Card>
            ) : (
              details.sashDetails.map((sash) => (
                <Card key={sash.index}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">
                      Створка #{sash.index}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Размеры:</span>{" "}
                        <span className="font-mono">
                          {sash.width} × {sash.height} мм
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Площадь:</span>{" "}
                        <span className="font-mono">
                          {((sash.width / 1000) * (sash.height / 1000)).toFixed(
                            4
                          )}{" "}
                          м²
                        </span>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-sm font-medium mb-2">📦 Ткань:</p>
                      <div className="bg-muted/50 rounded p-2 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span>Название:</span>
                          <span className="font-medium">
                            {sash.fabricName || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Тип:</span>
                          <span>
                            {sash.fabricType === "zebra" ? (
                              <Badge variant="secondary">Зебра</Badge>
                            ) : (
                              <Badge variant="outline">Рулон</Badge>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Ср. цена (за м²):</span>
                          <span className="font-mono">
                            {formatCurrency(sash.fabricAvgPrice)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Множитель типа:</span>
                          <span className="font-bold text-orange-600">
                            ×{sash.fabricMultiplier}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-medium">
                          <span>Формула:</span>
                          <span className="font-mono text-xs">
                            {(
                              (sash.width / 1000) *
                              (sash.height / 1000)
                            ).toFixed(4)}{" "}
                            × {sash.fabricAvgPrice.toFixed(2)} ×{" "}
                            {sash.fabricMultiplier}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium text-primary">
                          <span>Стоимость ткани:</span>
                          <span className="font-mono">
                            {formatCurrency(sash.fabricCost)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2">
                        🔧 Комплектующие:
                      </p>
                      <div className="bg-muted/50 rounded p-2 text-sm space-y-2">
                        {sash.componentsDetails.length > 0 ? (
                          <>
                            {sash.componentsDetails.map((comp, idx) => (
                              <div
                                key={idx}
                                className="border-b border-muted pb-2 last:border-0 last:pb-0"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-medium">
                                      {comp.name}
                                    </span>
                                    <div className="text-xs text-muted-foreground">
                                      <Badge variant="outline" className="mr-1">
                                        {comp.unit}
                                      </Badge>
                                      {["м", "пм", "п.м.", "м.п."].includes(
                                        comp.unit.toLowerCase()
                                      ) &&
                                        comp.sizeValue > 0 && (
                                          <span>
                                            {comp.sizeSource
                                              ? `по ${
                                                  comp.sizeSource === "width"
                                                    ? "ширине"
                                                    : "высоте"
                                                }`
                                              : "по ширине (авто)"}
                                            : {comp.sizeValue.toFixed(3)}м
                                          </span>
                                        )}
                                      {comp.quantity !== 1 && (
                                        <span className="ml-1">
                                          × {comp.quantity} шт
                                        </span>
                                      )}
                                      {comp.sizeMultiplier !== 1 && (
                                        <span className="ml-1 text-orange-600">
                                          множ: ×{comp.sizeMultiplier}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="font-mono font-medium">
                                    {formatCurrency(comp.totalPrice)}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 font-mono">
                                  {comp.formula} ={" "}
                                  {formatCurrency(comp.totalPrice)}
                                </div>
                                <div className="text-[10px] text-muted-foreground/50 mt-1 font-mono bg-muted/30 rounded px-1">
                                  [API: qty={comp.quantity}, src=
                                  {comp.sizeSource || "null"}, mult=
                                  {comp.sizeMultiplier}]
                                </div>
                              </div>
                            ))}
                            <Separator className="my-2" />
                            <div className="flex justify-between font-medium text-primary">
                              <span>Итого комплектующие:</span>
                              <span className="font-mono">
                                {formatCurrency(sash.componentsCost)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Нет комплектующих
                          </span>
                        )}
                      </div>
                    </div>

                    <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                      <CardContent className="py-3">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            Себестоимость створки:
                          </span>
                          <span className="font-mono text-lg font-bold text-green-700 dark:text-green-400">
                            {formatCurrency(sash.sashCost)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          = {formatCurrency(sash.fabricCost)} (ткань) +{" "}
                          {formatCurrency(sash.componentsCost)} (компл.)
                        </p>
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
              ))
            )}

            <Card className="bg-primary text-primary-foreground">
              <CardContent className="py-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">
                    ИТОГО СЕБЕСТОИМОСТЬ:
                  </span>
                  <span className="font-mono text-2xl font-bold">
                    {formatCurrency(details.totalCost)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
