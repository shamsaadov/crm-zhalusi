import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Scissors,
  Loader2,
  Printer,
  RefreshCw,
  AlertTriangle,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  type CuttingResponse,
  type CuttingLayoutResult,
  buildCutSvg,
  describeCutHeight,
  describeSkipped,
  fmtCm,
  formatCalculatedAt,
  getCutView,
  renderCuttingLayoutsHtml,
} from "./cutting-render";

interface CuttingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: number;
}

const EMPTY: CuttingResponse = {
  layouts: [],
  skipped: [],
  isStale: false,
  calculatedAt: null,
};

export function CuttingDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: CuttingDialogProps) {
  const { toast } = useToast();
  const [activeFabricId, setActiveFabricId] = useState<string | null>(null);

  const { data = EMPTY, isLoading } = useQuery<CuttingResponse>({
    queryKey: ["/api/orders", orderId, "cutting"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${orderId}/cutting`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Не удалось загрузить раскрой");
      const json = await r.json();
      // Совместимость со старым ответом (массив раскроев)
      return Array.isArray(json) ? { ...EMPTY, layouts: json } : json;
    },
    enabled: !!orderId && open,
  });

  const { layouts, skipped, isStale, calculatedAt } = data;

  // Активная ткань: первая по умолчанию, сбрасываем при смене заказа
  useEffect(() => {
    if (!open) setActiveFabricId(null);
  }, [open, orderId]);

  const activeLayout: CuttingLayoutResult | undefined = useMemo(() => {
    if (layouts.length === 0) return undefined;
    return layouts.find((l) => l.fabricId === activeFabricId) ?? layouts[0];
  }, [layouts, activeFabricId]);

  const calculateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/orders/${orderId}/cutting`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/orders", orderId, "cutting"],
      });
      toast({ title: "Раскрой рассчитан" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // Смена ширины рулона: обновляем ткань в справочнике и сразу пересчитываем.
  const rollWidthMutation = useMutation({
    mutationFn: async ({ fabricId, width }: { fabricId: string; width: number }) => {
      await apiRequest("PATCH", `/api/fabrics/${fabricId}`, { width: width.toFixed(2) });
      await apiRequest("POST", `/api/orders/${orderId}/cutting`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "cutting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fabrics"] });
      toast({ title: "Ширина рулона обновлена, раскрой пересчитан" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const handlePrint = () => {
    if (layouts.length === 0) return;
    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Раскрой заказа #${orderNumber || ""}</title>
          <style>body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }</style>
        </head>
        <body>
          <h2 style="margin:0 0 4px">Раскрой заказа #${orderNumber || ""}</h2>
          ${
            calculatedAt
              ? `<p style="margin:0 0 16px;font-size:12px;color:#6b7280">рассчитан ${formatCalculatedAt(calculatedAt)}</p>`
              : ""
          }
          ${renderCuttingLayoutsHtml(data)}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 200);
  };

  const warnings: string[] = [];
  if (isStale) {
    warnings.push("Створки заказа изменялись после расчёта. Пересчитайте раскрой.");
  }
  for (const s of skipped) warnings.push(`Не учтена: ${describeSkipped(s)}.`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          // Radix ловит Escape на document в capture-фазе, раньше React-обработчика
          // поля. Пока идёт правка ширины рулона, Escape отменяет её, а не закрывает окно.
          const el = document.activeElement as HTMLElement | null;
          if (el?.dataset?.testid === "input-roll-width") e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Раскрой заказа #{orderNumber}
            </span>
            {calculatedAt && (
              <span className="text-xs font-normal text-muted-foreground">
                рассчитан {formatCalculatedAt(calculatedAt)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : layouts.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            {warnings.length > 0 && (
              <Alert className="text-left border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4 !text-amber-700" />
                <AlertDescription>
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground text-sm">
              Раскрой ещё не рассчитан для этого заказа
            </p>
            <Button
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
              data-testid="button-calculate-cutting"
            >
              {calculateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <Scissors className="h-4 w-4 mr-2" />
              Рассчитать раскрой
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {layouts.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {layouts.map((l) => {
                  const active = l.id === activeLayout?.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setActiveFabricId(l.fabricId)}
                      className={
                        "rounded-md border px-3 py-1 text-sm transition-colors " +
                        (active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted")
                      }
                      data-testid={`cutting-fabric-${l.fabricId}`}
                    >
                      {l.fabricName || "Ткань"} · {l.rows.length}{" "}
                      {pluralCuts(l.rows.length)}
                    </button>
                  );
                })}
              </div>
            )}

            {warnings.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4 !text-amber-700" />
                <AlertDescription>
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {activeLayout && (
              <LayoutView
                layout={activeLayout}
                onRollWidthChange={(width) =>
                  rollWidthMutation.mutateAsync({
                    fabricId: activeLayout.fabricId,
                    width,
                  })
                }
                rollWidthPending={rollWidthMutation.isPending}
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {layouts.length > 0 && (
            <>
              <Button
                variant={isStale ? "default" : "outline"}
                size="sm"
                onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}
                data-testid="button-recalculate-cutting"
              >
                {calculateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Пересчитать
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Печать
              </Button>
            </>
          )}
          <Button
            variant={layouts.length > 0 && !isStale ? "default" : "outline"}
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function pluralCuts(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отрез";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "отреза";
  return "отрезов";
}

function LayoutView({
  layout,
  onRollWidthChange,
  rollWidthPending,
}: {
  layout: CuttingLayoutResult;
  onRollWidthChange: (width: number) => Promise<unknown>;
  rollWidthPending: boolean;
}) {
  const rollW = parseFloat(layout.rollWidth);
  const totalLen = parseFloat(layout.totalLength);
  const waste = parseFloat(layout.wastePercent);
  const cuts = layout.rows.map((r) => getCutView(r, layout));
  const maxCut = Math.max(...cuts.map((c) => c.cutLength), 1);
  const piecesCount = cuts.reduce((n, c) => n + c.pieces.length, 0);
  const anyPiece = cuts.flatMap((c) => c.pieces);
  const side = anyPiece.find((p) => p.sideAllowance)?.sideAllowance ?? 0;
  const heightAllowance =
    anyPiece.find((p) => p.heightAllowance)?.heightAllowance ?? 0;
  // Рулон не может быть уже самого широкого куска с припусками
  const widestPiece = anyPiece.reduce((m, p) => Math.max(m, p.fullWidth), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{layout.fabricName || "Ткань"}</span>
        {layout.fabricType === "zebra" && (
          <Badge variant="outline" className="text-xs">
            зебра · 2 слоя
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <RollWidthMetric
          value={rollW}
          min={widestPiece}
          pending={rollWidthPending}
          onSave={onRollWidthChange}
        />
        <Metric label="Отрезать" value={`${(totalLen / 100).toFixed(2)} п.м.`} />
        <Metric label="Кусков" value={String(piecesCount)} />
        <Metric
          label="Остаток"
          value={`${waste.toFixed(1)} %`}
          hint="доля неиспользованной площади в отрезах"
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendItem
          swatch={{ background: "#eaf3de", border: "1px solid #639922" }}
          label="створка, чистый размер"
        />
        <LegendItem
          swatch={{
            backgroundImage:
              "repeating-linear-gradient(135deg,#888780 0 1.5px,transparent 1.5px 4px)",
            border: "1px solid #888780",
          }}
          label={
            side || heightAllowance
              ? `припуск: ${fmtCm(side)} см по бокам, ${fmtCm(heightAllowance)} см по высоте`
              : "припуск"
          }
        />
        <LegendItem
          swatch={{ background: "#fcebeb", border: "1px dashed #e24b4a" }}
          label="остаток рулона"
        />
      </div>

      <div className="space-y-2">
        {cuts.map((cut) => (
          <div
            key={cut.rowIndex}
            className="rounded-md border p-3 space-y-2"
            data-testid={`cutting-row-${cut.rowIndex}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">
                Отрез {cut.rowIndex} · {fmtCm(cut.cutLength)} см
              </span>
              <span className="text-xs text-muted-foreground">
                {describeCutHeight(cut)} · занято {fmtCm(cut.usedWidth)} из{" "}
                {fmtCm(cut.rollWidth)} см
              </span>
            </div>

            <div
              dangerouslySetInnerHTML={{
                __html: buildCutSvg(cut, {
                  maxCutLength: maxCut,
                  idSuffix: `-${layout.id}-${cut.rowIndex}`,
                }),
              }}
            />

            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-8">Кусок</TableHead>
                  <TableHead className="h-8">Чистый размер</TableHead>
                  <TableHead className="h-8">С припуском</TableHead>
                  <TableHead className="h-8">От края рулона</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cut.pieces.map((p, i) => (
                  <TableRow key={i} className="text-sm">
                    <TableCell className="py-1.5">
                      №{p.sashIndex}
                      {p.roomName && (
                        <span className="text-muted-foreground"> · {p.roomName}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono">
                      {fmtCm(p.cleanWidth)} × {fmtCm(p.cleanHeight)}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-muted-foreground">
                      {fmtCm(p.fullWidth)} × {fmtCm(p.fullHeight)}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono">
                      {fmtCm(p.from)} – {fmtCm(p.to)} см
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
}

// Защита от опечаток вроде «200100»: рулонов шире не бывает
const MAX_ROLL_WIDTH_CM = 1000;

function RollWidthMetric({
  value,
  min,
  pending,
  onSave,
}: {
  value: number;
  min: number;
  pending: boolean;
  onSave: (width: number) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(fmtCm(value));
  }, [value, editing]);

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const parsed = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Введите ширину в сантиметрах");
      return;
    }
    if (parsed < min) {
      setError(`Уже самого широкого куска с припуском (${fmtCm(min)} см)`);
      return;
    }
    if (parsed > MAX_ROLL_WIDTH_CM) {
      setError(`Ширина рулона не больше ${MAX_ROLL_WIDTH_CM} см`);
      return;
    }
    if (parsed === value) {
      cancel();
      return;
    }
    try {
      await onSave(parsed);
      cancel();
    } catch {
      // ошибка показана тостом в мутации
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Изменить ширину рулона у ткани"
        className="group rounded-md bg-muted/50 px-3 py-2 text-left hover:bg-muted transition-colors"
        data-testid="button-edit-roll-width"
      >
        <div className="text-xs text-muted-foreground">Рулон</div>
        <div className="flex items-center gap-1.5 text-lg font-semibold leading-tight">
          {fmtCm(value)} см
          <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" />
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 ring-1 ring-primary/40">
      <div className="text-xs text-muted-foreground">Рулон, см</div>
      <div className="mt-0.5 flex items-center gap-1">
        <Input
          autoFocus
          inputMode="decimal"
          value={draft}
          disabled={pending}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onFocus={(e) => e.target.select()}
          className="h-8 w-20 px-2 text-base font-semibold"
          data-testid="input-roll-width"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => void save()}
          disabled={pending}
          title="Сохранить и пересчитать"
          data-testid="button-save-roll-width"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={cancel}
          disabled={pending}
          title="Отмена"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          "Изменит ширину рулона у ткани в справочнике"
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2" title={hint}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

function LegendItem({
  swatch,
  label,
}: {
  swatch: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={swatch} />
      {label}
    </span>
  );
}
