import { useState, useEffect, useCallback } from "react";
import { UseFormReturn, UseFieldArrayReturn } from "react-hook-form";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, pointerWithin, type DragEndEvent } from "@dnd-kit/core";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Check,
  Wallet,
  Info,
  Home,
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
import { RoomContainer } from "./room-container";
import { useRoomGroups } from "./use-room-groups";
import { calculateCostPrice } from "./utils";
import { DeleteRoomDialog } from "./delete-room-dialog";
import type { Room } from "./types";

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
  resetToken: number;
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
  resetToken,
  onSubmit,
  onCancel,
  onShowCostCalculation,
  onSashRemove,
  calculatingSashes,
  isManualSalePrice = false,
  onManualSalePriceChange,
}: OrderFormProps) {
  const { fields, append, remove } = fieldArray;
  const {
    roomGroups,
    rooms,
    addRoom,
    renameRoom,
    removeRoom,
    moveSash,
    seedRooms,
    autoEditRoomId,
    clearAutoEdit,
  } = useRoomGroups(form, fieldArray);

  const [deleteDialog, setDeleteDialog] = useState<{
    room: Room;
    sashCount: number;
  } | null>(null);

  useEffect(() => {
    seedRooms(form.getValues("sashes"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const sashIndex = active.data.current?.index as number | undefined;
    const overId = String(over.id);
    if (!overId.startsWith("room-")) return;
    const targetRoomId = parseInt(overId.slice("room-".length), 10);
    if (Number.isNaN(targetRoomId)) return;
    if (sashIndex !== undefined) {
      moveSash(sashIndex, targetRoomId);
    }
  }, [moveSash]);

  const [isPaidPopoverOpen, setIsPaidPopoverOpen] = useState(false);
  const [localManualPrice, setLocalManualPrice] = useState(false);
  const [showQuickDealer, setShowQuickDealer] = useState(false);
  const [quickDealerName, setQuickDealerName] = useState("");
  const [quickDealerPhone, setQuickDealerPhone] = useState("");

  const createDealerMutation = useMutation({
    mutationFn: (data: { fullName: string; phone?: string }) =>
      apiRequest("POST", "/api/dealers", data),
    onSuccess: async (res: any) => {
      const dealer = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      form.setValue("dealerId", dealer.id);
      setShowQuickDealer(false);
      setQuickDealerName("");
      setQuickDealerPhone("");
    },
  });

  // Используем внешнее состояние если передано, иначе локальное
  const isSalePriceEditable = onManualSalePriceChange
    ? isManualSalePrice
    : localManualPrice;
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

  const isPaid = form.watch("isPaid");
  const selectedCashboxId = form.watch("cashboxId");
  const selectedCashbox = cashboxes.find((c) => c.id === selectedCashboxId);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <div className="flex justify-end mb-2 flex-shrink-0">
          <Button type="submit" disabled={isPending} size="sm">
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEditing ? "Сохранить" : "Создать"}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
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
                    <div className="flex gap-1">
                      <div className="flex-1">
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
                      </div>
                      <Popover open={showQuickDealer} onOpenChange={setShowQuickDealer}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Добавить дилера">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="end">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Новый дилер</p>
                            <Input
                              placeholder="Имя дилера"
                              value={quickDealerName}
                              onChange={(e) => setQuickDealerName(e.target.value)}
                              className="h-8"
                            />
                            <Input
                              placeholder="Телефон"
                              value={quickDealerPhone}
                              onChange={(e) => setQuickDealerPhone(e.target.value)}
                              className="h-8"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="w-full"
                              disabled={!quickDealerName.trim() || createDealerMutation.isPending}
                              onClick={() => createDealerMutation.mutate({
                                fullName: quickDealerName.trim(),
                                phone: quickDealerPhone.trim() || undefined,
                              })}
                            >
                              {createDealerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Створки
              <Badge variant="secondary" className="ml-2">
                {fields.length} {fields.length !== 1 ? "позиций" : "позиция"}
              </Badge>
            </h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  addRoom();
                }}
              >
                <Home className="h-3.5 w-3.5" />
                Комната
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestCalculation}
                className="gap-2"
              >
                <Info className="h-4 w-4" />
                Подробности заказа
              </Button>
            </div>
          </div>

          <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
            <div className="space-y-3">
              {roomGroups.map((group) => {
                const sashCount = group.sashIndices.length;
                return (
                  <RoomContainer
                    key={`room-${group.room.id}`}
                    roomId={group.room.id}
                    roomName={group.room.name}
                    sashIndices={group.sashIndices}
                    fields={fields}
                    form={form}
                    systems={systems}
                    fabrics={fabrics}
                    totalFields={fields.length}
                    autoEdit={autoEditRoomId === group.room.id}
                    canDelete={rooms.length > 1}
                    onRemoveSash={handleSashRemove}
                    onRenameRoom={(newName) => renameRoom(group.room.id, newName)}
                    onDeleteRoom={() => {
                      if (rooms.length <= 1) return;
                      if (sashCount === 0) {
                        removeRoom(group.room.id);
                      } else {
                        setDeleteDialog({ room: group.room, sashCount });
                      }
                    }}
                    onAddSash={() => {
                      const sashes = form.getValues("sashes");
                      const lastSash = sashes[sashes.length - 1];
                      append({
                        width: "",
                        height: "",
                        quantity: "1",
                        systemId: lastSash?.systemId || "",
                        controlSide: "",
                        fabricId: lastSash?.fabricId || "",
                        sashPrice: "",
                        sashCost: "",
                        coefficient: "",
                        isCalculating: false,
                        room: group.room.id,
                        roomName: group.room.name,
                      });
                    }}
                    onAutoEditConsumed={clearAutoEdit}
                    calculatingSashes={calculatingSashes}
                  />
                );
              })}
            </div>
          </DndContext>
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
                          // Пересчитываем цену из текущих цен створок
                          const sashes = form.getValues("sashes");
                          const totalPrice = sashes.reduce((sum, s) => {
                            const price = parseFloat(s.sashPrice || "0");
                            const qty = parseFloat(s.quantity || "1");
                            return sum + price * qty;
                          }, 0);
                          if (totalPrice > 0) {
                            form.setValue("salePrice", totalPrice.toFixed(2), {
                              shouldValidate: false,
                            });
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
                <FormLabel>Себестоимость (авто)</FormLabel>
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

        </div>
        <div className="flex justify-end gap-2 pt-3 border-t mt-3 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleTestCalculation}
            className="gap-2"
          >
            <Info className="h-4 w-4" />
            Подробности заказа
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Сохранить" : "Создать"}
          </Button>
        </div>
        <DeleteRoomDialog
          open={deleteDialog !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteDialog(null);
          }}
          room={deleteDialog?.room ?? null}
          sashCount={deleteDialog?.sashCount ?? 0}
          otherRooms={rooms.filter((r) => r.id !== deleteDialog?.room.id)}
          onConfirm={(moveSashesTo) => {
            if (deleteDialog) {
              removeRoom(deleteDialog.room.id, moveSashesTo);
            }
            setDeleteDialog(null);
          }}
        />
      </form>
    </Form>
  );
}
