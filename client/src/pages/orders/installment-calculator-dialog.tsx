import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, RefreshCw, Check, X } from "lucide-react";
import { formatCurrency } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Cashbox {
  id: string;
  name: string;
}

interface InstallmentPayment {
  id: string;
  planId: string;
  paymentNumber: number;
  dueDate: string;
  amount: string;
  isPaid: boolean | null;
  paidAt: string | null;
  financeOperationId: string | null;
}

interface InstallmentPlan {
  id: string;
  orderId: string;
  totalAmount: string;
  downPayment: string;
  months: number;
  paymentDay: number;
  monthlyPayment: string;
  isActive: boolean | null;
  payments: InstallmentPayment[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  totalAmount: number;
  orderNumber: number;
  dealerName: string;
  orderDate: string;
  cashboxes: Cashbox[];
}

const MONTH_OPTIONS = [2, 3, 4, 5, 6, 9, 12];
const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function generatePreviewSchedule(
  totalAmount: number,
  downPayment: number,
  months: number,
  paymentDay: number
) {
  const remaining = totalAmount - downPayment;
  if (remaining <= 0) return [];

  const monthlyRaw = Math.floor((remaining / months) * 100) / 100;
  const schedule: { num: number; date: string; amount: number; balance: number }[] = [];

  let balance = totalAmount;

  if (downPayment > 0) {
    balance -= downPayment;
    schedule.push({
      num: 0,
      date: new Date().toISOString().split("T")[0],
      amount: downPayment,
      balance,
    });
  }

  const today = new Date();
  let startMonth = today.getMonth() + 1; // 0-based → 1-based next month
  let startYear = today.getFullYear();
  if (today.getDate() > paymentDay) {
    startMonth++;
  }

  for (let i = 0; i < months; i++) {
    let m = startMonth + i;
    let y = startYear;
    while (m > 12) {
      m -= 12;
      y++;
    }
    const amount = i === months - 1 ? remaining - monthlyRaw * (months - 1) : monthlyRaw;
    balance -= amount;

    schedule.push({
      num: i + 1,
      date: `${y}-${String(m).padStart(2, "0")}-${String(paymentDay).padStart(2, "0")}`,
      amount: Math.round(amount * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    });
  }

  return schedule;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export function InstallmentCalculatorDialog({
  open,
  onOpenChange,
  orderId,
  totalAmount,
  orderNumber,
  dealerName,
  orderDate,
  cashboxes,
}: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"create" | "view">("create");
  const [downPayment, setDownPayment] = useState("0");
  const [months, setMonths] = useState(3);
  const [paymentDay, setPaymentDay] = useState(15);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Fetch existing plan
  const { data: existingPlan, isLoading } = useQuery<InstallmentPlan | null>({
    queryKey: [`/api/orders/${orderId}/installment`],
    enabled: open && !!orderId,
  });

  useEffect(() => {
    if (existingPlan && existingPlan.isActive) {
      setMode("view");
    } else {
      setMode("create");
    }
  }, [existingPlan]);

  // Create plan mutation
  const createMutation = useMutation({
    mutationFn: async (data: { downPayment: number; months: number; paymentDay: number }) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/installment`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "План рассрочки создан" });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/installment`] });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  // Pay mutation
  const payMutation = useMutation({
    mutationFn: async ({ paymentId, cashboxId }: { paymentId: string; cashboxId: string }) => {
      await apiRequest("POST", `/api/installment-payments/${paymentId}/pay`, { cashboxId });
    },
    onSuccess: () => {
      toast({ title: "Платёж отмечен" });
      setPayingId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/installment`] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  // Unpay mutation
  const unpayMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("POST", `/api/installment-payments/${paymentId}/unpay`);
    },
    onSuccess: () => {
      toast({ title: "Оплата отменена" });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/installment`] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashboxes"] });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  // Preview schedule for create mode
  const dp = parseFloat(downPayment) || 0;
  const preview = useMemo(
    () => generatePreviewSchedule(totalAmount, dp, months, paymentDay),
    [totalAmount, dp, months, paymentDay]
  );

  const handleCreate = () => {
    createMutation.mutate({ downPayment: dp, months, paymentDay });
  };

  const handleRecreate = () => {
    if (existingPlan) {
      setDownPayment(existingPlan.downPayment || "0");
      setMonths(existingPlan.months);
      setPaymentDay(existingPlan.paymentDay);
    }
    setMode("create");
  };

  const handlePrint = () => {
    const plan = mode === "view" && existingPlan ? existingPlan : null;
    const scheduleRows = plan
      ? plan.payments.map((p) => ({
          num: p.paymentNumber,
          date: p.dueDate,
          amount: parseFloat(p.amount),
          isPaid: !!p.isPaid,
          paidAt: p.paidAt,
        }))
      : preview.map((p) => ({
          num: p.num,
          date: p.date,
          amount: p.amount,
          isPaid: false,
          paidAt: null as string | null,
        }));

    printInstallmentSchedule({
      orderNumber,
      orderDate,
      dealerName,
      totalAmount,
      downPayment: plan ? parseFloat(plan.downPayment || "0") : dp,
      months: plan ? plan.months : months,
      paymentDay: plan ? plan.paymentDay : paymentDay,
      rows: scheduleRows,
    });
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Рассрочка — Заказ №{orderNumber}
            {mode === "view" && (
              <Badge variant="outline" className="ml-2">Активный план</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : mode === "create" ? (
          /* ── CREATE MODE ── */
          <div className="flex-1 overflow-auto space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Первый взнос</Label>
                <Input
                  type="number"
                  min={0}
                  max={totalAmount}
                  step={100}
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Итого: {formatCurrency(totalAmount)}
                </p>
              </div>
              <div>
                <Label>Кол-во месяцев</Label>
                <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>{m} мес.</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>День оплаты</Label>
                <Select value={String(paymentDay)} onValueChange={(v) => setPaymentDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dp >= totalAmount ? (
              <p className="text-center text-muted-foreground py-4">
                Первый взнос покрывает всю сумму — рассрочка не нужна
              </p>
            ) : (
              <>
                <Separator />
                <div className="text-sm font-medium">
                  Ежемесячный платёж: {formatCurrency(preview[preview.length - 1]?.amount || 0)}
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-3 py-2 text-left w-10">№</th>
                        <th className="px-3 py-2 text-left">Дата</th>
                        <th className="px-3 py-2 text-right">Сумма</th>
                        <th className="px-3 py-2 text-right">Остаток</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row) => (
                        <tr key={row.num} className="border-t">
                          <td className="px-3 py-2">{row.num === 0 ? "—" : row.num}</td>
                          <td className="px-3 py-2">{formatDate(row.date)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatCurrency(row.amount)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatCurrency(Math.max(0, row.balance))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── VIEW MODE ── */
          <div className="flex-1 overflow-auto space-y-4">
            {existingPlan && (
              <>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Сумма:</span>{" "}
                    <strong>{formatCurrency(existingPlan.totalAmount)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Первый взнос:</span>{" "}
                    <strong>{formatCurrency(existingPlan.downPayment)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Месяцев:</span>{" "}
                    <strong>{existingPlan.months}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">День оплаты:</span>{" "}
                    <strong>{existingPlan.paymentDay}</strong>
                  </div>
                </div>

                <Separator />

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-3 py-2 text-left w-10">№</th>
                        <th className="px-3 py-2 text-left">Дата</th>
                        <th className="px-3 py-2 text-right">Сумма</th>
                        <th className="px-3 py-2 text-center">Статус</th>
                        <th className="px-3 py-2 text-center w-24">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingPlan.payments.map((p) => {
                        const isOverdue = !p.isPaid && p.dueDate < todayStr;
                        return (
                          <tr
                            key={p.id}
                            className={`border-t ${isOverdue ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                          >
                            <td className="px-3 py-2">
                              {p.paymentNumber === 0 ? "—" : p.paymentNumber}
                            </td>
                            <td className="px-3 py-2">{formatDate(p.dueDate)}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {p.isPaid ? (
                                <Badge variant="default" className="bg-green-600 text-xs">
                                  Оплачен {p.paidAt ? formatDate(p.paidAt) : ""}
                                </Badge>
                              ) : isOverdue ? (
                                <Badge variant="destructive" className="text-xs">
                                  Просрочен
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Ожидает
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {p.isPaid ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-600"
                                  onClick={() => unpayMutation.mutate(p.id)}
                                  disabled={unpayMutation.isPending}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Отмена
                                </Button>
                              ) : (
                                <Popover
                                  open={payingId === p.id}
                                  onOpenChange={(o) => setPayingId(o ? p.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-7 text-xs">
                                      <Check className="h-3 w-3 mr-1" />
                                      Оплатить
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48 p-2">
                                    <p className="text-xs text-muted-foreground mb-2">Касса:</p>
                                    {cashboxes.map((cb) => (
                                      <Button
                                        key={cb.id}
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-xs"
                                        disabled={payMutation.isPending}
                                        onClick={() =>
                                          payMutation.mutate({
                                            paymentId: p.id,
                                            cashboxId: cb.id,
                                          })
                                        }
                                      >
                                        {payMutation.isPending ? (
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : null}
                                        {cb.name}
                                      </Button>
                                    ))}
                                  </PopoverContent>
                                </Popover>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                {(() => {
                  const paid = existingPlan.payments
                    .filter((p) => p.isPaid)
                    .reduce((s, p) => s + parseFloat(p.amount), 0);
                  const remaining = parseFloat(existingPlan.totalAmount) - paid;
                  return (
                    <div className="flex justify-between text-sm font-medium">
                      <span>
                        Оплачено: <span className="text-green-600">{formatCurrency(paid)}</span>
                      </span>
                      <span>
                        Осталось: <span className="text-red-600">{formatCurrency(remaining)}</span>
                      </span>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode === "create" ? (
            <>
              <Button variant="outline" onClick={handlePrint} disabled={dp >= totalAmount}>
                <Printer className="h-4 w-4 mr-2" />
                Печать
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || dp >= totalAmount}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить план
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleRecreate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Пересоздать
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Печать
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Print function ───

function printInstallmentSchedule(data: {
  orderNumber: number;
  orderDate: string;
  dealerName: string;
  totalAmount: number;
  downPayment: number;
  months: number;
  paymentDay: number;
  rows: { num: number; date: string; amount: number; isPaid: boolean; paidAt: string | null }[];
}) {
  const win = window.open("", "_blank");
  if (!win) return;

  const [y, m, d] = data.orderDate.split("-");
  const dateFormatted = d && m && y ? `${d}.${m}.${y}` : data.orderDate;

  let balance = data.totalAmount;
  const tableRows = data.rows
    .map((r) => {
      balance -= r.amount;
      return `
        <tr>
          <td class="center">${r.num === 0 ? "—" : r.num}</td>
          <td class="center">${formatDate(r.date)}</td>
          <td class="right">${r.amount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
          <td class="right">${Math.max(0, balance).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
          <td class="center">${r.isPaid ? "Оплачен" + (r.paidAt ? " " + formatDate(r.paidAt) : "") : ""}</td>
        </tr>
      `;
    })
    .join("");

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Рассрочка — Заказ №${data.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
          p { margin: 0 0 6px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #6b7280; padding: 6px 8px; }
          th { background: #f3f4f6; font-weight: 600; text-align: center; }
          td.center { text-align: center; }
          td.right { text-align: right; }
          .total { font-size: 15px; font-weight: 700; text-align: right; margin-top: 12px; }
          .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
          .signatures div { width: 40%; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 13px; }
        </style>
      </head>
      <body>
        <p>Заказ № <strong>${data.orderNumber}</strong></p>
        <p>Дата заказа: <strong>${dateFormatted}</strong></p>
        <p>Покупатель: <strong>${data.dealerName}</strong></p>
        <p>Рассрочка: <strong>${data.months} мес.</strong>, день оплаты: <strong>${data.paymentDay}</strong></p>
        ${data.downPayment > 0 ? `<p>Первый взнос: <strong>${data.downPayment.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</strong></p>` : ""}

        <table>
          <thead>
            <tr>
              <th style="width:40px">№</th>
              <th>Дата платежа</th>
              <th>Сумма</th>
              <th>Остаток</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p class="total">Итого: ${data.totalAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</p>

        <div class="signatures">
          <div>Продавец</div>
          <div>Покупатель</div>
        </div>
      </body>
    </html>
  `);

  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 150);
}
