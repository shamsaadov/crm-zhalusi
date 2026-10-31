// Табличная часть «Изделия» документа ЗП как ues-erp-lines в УЭС: строки редактируются
// прямо в таблице, створки сгруппированы по комнатам, у каждой строки — состояние
// в производстве (не передано / в работе / готово). Готовые строки заблокированы.

import { useEffect, useRef, useState } from "react";
import { Controller, useWatch, type UseFieldArrayReturn, type UseFormReturn } from "react-hook-form";
import { Copy, Home, Loader2, MoreHorizontal, Pin, Plus, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtMoney } from "@/components/ues/report-kit";
import { usePinnedSystems } from "@/hooks/use-pinned-systems";
import { cn } from "@/lib/utils";
import { CONTROL_SIDES, type Fabric } from "@shared/schema";
import type { OrderFormValues, SashFormValues } from "./schemas";
import type { SystemWithComponents } from "./types";
import { useRoomGroups } from "./use-room-groups";
import { emptySash } from "./use-order-editor";

const MIN_CM = 10;
const MAX_CM = 400;

export type LineProduction = "draft" | "waiting" | "in_work" | "ready";

export function lineProduction(s: Pick<SashFormValues, "productionStatus">, saved: boolean): LineProduction {
  if (s.productionStatus === "ready") return "ready";
  if (s.productionStatus === "in_work") return "in_work";
  return saved ? "waiting" : "draft";
}

const PRODUCTION_LABEL: Record<LineProduction, string> = {
  draft: "—",
  waiting: "Не передано",
  in_work: "В работе",
  ready: "Готово",
};

function fabricsForSystem(system: SystemWithComponents | undefined, fabrics: Fabric[], currentId?: string) {
  const key = system?.systemKey?.toLowerCase();
  if (!key) return fabrics;
  const isZebra = key.includes("zebra");
  if (!isZebra && !key.includes("roll")) return fabrics;
  const type = isZebra ? "zebra" : "roll";
  const list = fabrics.filter((f) => (f.fabricType || "roll") === type);
  if (currentId && !list.some((f) => f.id === currentId)) {
    const cur = fabrics.find((f) => f.id === currentId);
    if (cur) list.push(cur);
  }
  return list.length ? list : fabrics;
}

interface Props {
  form: UseFormReturn<OrderFormValues>;
  fieldArray: UseFieldArrayReturn<OrderFormValues, "sashes">;
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  calculatingSashes: Set<number>;
  resetToken: number;
  /** Документ записан — показываем состояние производства строк. */
  saved: boolean;
  /** Документ отгружен или помечен на удаление: строки только для чтения. */
  locked: boolean;
  onRemove: (index: number) => void;
}

export function OrderLines({ form, fieldArray, systems, fabrics, calculatingSashes, resetToken, saved, locked, onRemove }: Props) {
  const { fields, append, insert } = fieldArray;
  const rooms = useRoomGroups(form, fieldArray);
  const { sortSystems, toggle: togglePin, isPinned } = usePinnedSystems();
  const sortedSystems = sortSystems(systems);
  const [active, setActive] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const sashes = (useWatch({ control: form.control, name: "sashes" }) as SashFormValues[] | undefined) ?? [];

  useEffect(() => {
    rooms.seedRooms(form.getValues("sashes"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const focusWidth = (index: number) =>
    setTimeout(() => tableRef.current?.querySelector<HTMLInputElement>(`[data-line="${index}"] input[name$=".width"]`)?.focus(), 30);

  const addToRoom = (roomId: number, roomName: string) => {
    const last = form.getValues("sashes").at(-1);
    append(emptySash({ systemId: last?.systemId || "", fabricId: last?.fabricId || "", room: roomId, roomName }));
    focusWidth(fields.length);
  };

  const copyLine = (index: number) => {
    const s = form.getValues(`sashes.${index}`);
    insert(index + 1, { ...s, id: undefined, productionStatus: null, productionReadyAt: null });
    focusWidth(index + 1);
  };

  // F12 — добавить строку в комнату активной строки (как «Добавить позицию · F12» в УЭС).
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F12") return;
      e.preventDefault();
      const roomId = active != null ? sashes[active]?.room ?? 1 : rooms.rooms.at(-1)?.id ?? 1;
      const room = rooms.rooms.find((r) => r.id === roomId);
      addToRoom(roomId, room?.name ?? "");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let lineNo = 0;

  return (
    <section className="ues-erp-lines">
      <div className="ues-erp-lines-toolbar">
        <button
          type="button"
          className="ues-btn h-8"
          disabled={locked}
          onClick={() => {
            const room = rooms.rooms.at(-1);
            addToRoom(room?.id ?? 1, room?.name ?? "");
          }}
          data-testid="button-add-line"
        >
          <Plus className="h-4 w-4" />
          Добавить изделие · F12
        </button>
        <button type="button" className="ues-btn h-8" disabled={locked} onClick={() => rooms.addRoom()}>
          <Home className="h-4 w-4" />
          Комната
        </button>
        {form.formState.errors.sashes?.root?.message || form.formState.errors.sashes?.message ? (
          <span className="text-[12.5px] font-semibold text-[var(--ues-danger)]">
            {form.formState.errors.sashes?.root?.message || form.formState.errors.sashes?.message}
          </span>
        ) : null}
      </div>

      <div className="ues-table-wrap ues-lines-wrap" ref={tableRef}>
        <table className="ues-table ues-lines-table">
          <colgroup>
            <col style={{ width: 42 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 70 }} />
            <col />
            <col />
            <col style={{ width: 78 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 118 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th>№</th>
              <th className="text-right">Ширина, см</th>
              <th className="text-right">Высота, см</th>
              <th className="text-right">Кол-во</th>
              <th>Система</th>
              <th>Ткань</th>
              <th>Упр.</th>
              <th className="text-right">Коэф.</th>
              <th className="text-right">Цена</th>
              <th className="text-right">Сумма</th>
              <th>Производство</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rooms.roomGroups.map((group) => {
              const roomSum = group.sashIndices.reduce(
                (sum, i) => sum + parseFloat(sashes[i]?.sashPrice || "0") * parseFloat(sashes[i]?.quantity || "1"),
                0
              );
              return [
                <tr key={`room-${group.room.id}`} className="ues-lines-room">
                  <td colSpan={12}>
                    <div className="flex items-center gap-2">
                      <Home className="h-3.5 w-3.5 text-[var(--ues-primary)]" />
                      <input
                        className="ues-lines-room-name"
                        defaultValue={group.room.name}
                        key={`${group.room.id}-${resetToken}`}
                        placeholder={rooms.rooms.length > 1 ? `Комната ${group.room.id}` : "Комната (необязательно)"}
                        disabled={locked}
                        autoFocus={rooms.autoEditRoomId === group.room.id}
                        onFocus={rooms.clearAutoEdit}
                        onBlur={(e) => rooms.renameRoom(group.room.id, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      <span className="ues-day-meta !ml-0">
                        {group.sashIndices.length} изд. · {fmtMoney(roomSum)}
                      </span>
                      {!locked && (
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            className="ues-btn h-7 px-2 text-[12px]"
                            onClick={() => addToRoom(group.room.id, group.room.name)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Изделие
                          </button>
                          {rooms.rooms.length > 1 && (
                            <button
                              type="button"
                              className="ues-btn h-7 px-2 text-[12px]"
                              title="Удалить комнату вместе с изделиями"
                              disabled={group.sashIndices.some((i) => sashes[i]?.productionStatus)}
                              onClick={() => rooms.removeRoom(group.room.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>,
                ...group.sashIndices.map((index) => {
                  lineNo += 1;
                  const s = sashes[index] ?? ({} as SashFormValues);
                  const field = fields[index];
                  const prod = lineProduction(s, saved);
                  const rowLocked = locked || prod === "ready";
                  const system = systems.find((x) => x.id === s.systemId);
                  const w = parseFloat(s.width || "0");
                  const h = parseFloat(s.height || "0");
                  const wBad = w > 0 && (w < MIN_CM || w > MAX_CM);
                  const hBad = h > 0 && (h < MIN_CM || h > MAX_CM);
                  const err = form.formState.errors.sashes?.[index];
                  const noCoef = w > 0 && h > 0 && !!s.systemId && !!s.fabricId && !calculatingSashes.has(index) && parseFloat(s.sashPrice || "0") === 0;
                  const sum = parseFloat(s.sashPrice || "0") * parseFloat(s.quantity || "1");
                  return (
                    <tr
                      key={field?.id ?? index}
                      data-line={index}
                      className={cn(
                        "ues-line",
                        active === index && "is-active-line",
                        saved && `ues-line-${prod}`,
                        noCoef && "ues-line-warn"
                      )}
                      onFocusCapture={() => setActive(index)}
                      onClick={() => setActive(index)}
                      title={prod === "ready" ? "Изделие готово — чтобы изменить, отмените готовность в «Производство → Готовые»" : undefined}
                    >
                      <td className="ues-muted tabular-nums">{lineNo}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          className={cn("ues-cell-input text-right", (wBad || err?.width) && "is-invalid")}
                          title={wBad ? `Проверьте размер (${MIN_CM}–${MAX_CM} см)` : undefined}
                          placeholder="см"
                          disabled={rowLocked}
                          {...form.register(`sashes.${index}.width`)}
                          data-testid={`input-sash-width-${index}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          className={cn("ues-cell-input text-right", (hBad || err?.height) && "is-invalid")}
                          title={hBad ? `Проверьте размер (${MIN_CM}–${MAX_CM} см)` : undefined}
                          placeholder="см"
                          disabled={rowLocked}
                          {...form.register(`sashes.${index}.height`)}
                          data-testid={`input-sash-height-${index}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="ues-cell-input text-right"
                          disabled={rowLocked || !!s.id}
                          title={s.id ? "Записанные изделия — по одному в строке; добавьте копию строки" : undefined}
                          {...form.register(`sashes.${index}.quantity`)}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <div className="min-w-0 flex-1">
                            <Controller
                              control={form.control}
                              name={`sashes.${index}.systemId`}
                              render={({ field: f }) => (
                                <SearchableSelect
                                  options={sortedSystems.map((x) => ({
                                    value: x.id,
                                    label: isPinned(x.id) ? `📌 ${x.name}` : x.name,
                                  }))}
                                  value={f.value}
                                  onValueChange={f.onChange}
                                  placeholder={s.systemName && !f.value ? s.systemName : "Система"}
                                  searchPlaceholder="Поиск системы..."
                                  emptyText="Система не найдена"
                                  disabled={rowLocked}
                                  className="ues-cell-select"
                                />
                              )}
                            />
                          </div>
                          {s.systemId && active === index && !rowLocked && (
                            <button
                              type="button"
                              className="ues-cell-icon"
                              onClick={() => togglePin(s.systemId!)}
                              title={isPinned(s.systemId) ? "Открепить систему" : "Закрепить систему наверху списка"}
                            >
                              <Pin className={cn("h-3 w-3", isPinned(s.systemId) && "fill-current text-[var(--ues-primary)]")} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <Controller
                          control={form.control}
                          name={`sashes.${index}.fabricId`}
                          render={({ field: f }) => (
                            <SearchableSelect
                              options={fabricsForSystem(system, fabrics, f.value).map((x) => ({ value: x.id, label: x.name }))}
                              value={f.value}
                              onValueChange={f.onChange}
                              placeholder={s.fabricName && !f.value ? s.fabricName : "Ткань"}
                              searchPlaceholder="Поиск ткани..."
                              emptyText="Ткань не найдена"
                              disabled={rowLocked}
                              className="ues-cell-select"
                            />
                          )}
                        />
                      </td>
                      <td>
                        <select className="ues-cell-input" disabled={rowLocked} {...form.register(`sashes.${index}.controlSide`)}>
                          <option value="">—</option>
                          {CONTROL_SIDES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right tabular-nums text-[var(--ues-primary-text)]">
                        {calculatingSashes.has(index) ? (
                          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
                        ) : s.coefficient ? (
                          parseFloat(s.coefficient).toFixed(2)
                        ) : (
                          <span className="ues-muted">—</span>
                        )}
                      </td>
                      <td
                        className={cn("text-right tabular-nums", noCoef && "text-[var(--ues-danger)]")}
                        title={noCoef ? "Нет коэффициента: проверьте system_key системы" : undefined}
                      >
                        {s.sashPrice ? fmtMoney(parseFloat(s.sashPrice)) : <span className="ues-muted">—</span>}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{sum ? fmtMoney(sum) : "—"}</td>
                      <td>
                        <span className={cn("ues-line-state", `is-${prod}`)}>
                          {PRODUCTION_LABEL[prod]}
                          {prod === "ready" && s.productionReadyAt ? ` ${new Date(s.productionReadyAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}` : ""}
                        </span>
                      </td>
                      <td>
                        {!locked && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="ues-cell-icon" aria-label="Действия со строкой">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyLine(index)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Скопировать строку
                              </DropdownMenuItem>
                              {rooms.rooms.length > 1 && !rowLocked && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[12px] text-[var(--ues-muted)]">Перенести в комнату</DropdownMenuLabel>
                                  {rooms.rooms
                                    .filter((r) => r.id !== group.room.id)
                                    .map((r) => (
                                      <DropdownMenuItem key={r.id} onClick={() => rooms.moveSash(index, r.id)}>
                                        {r.name || `Комната ${r.id}`}
                                      </DropdownMenuItem>
                                    ))}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[var(--ues-danger)]"
                                disabled={rowLocked || fields.length <= 1 || s.productionStatus === "in_work"}
                                onClick={() => onRemove(index)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Удалить строку
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
