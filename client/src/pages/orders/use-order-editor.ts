// Логика формы заказа со створками: коэффициенты и цены створок, себестоимость,
// загрузка заказа/замера в форму и подготовка данных к записи.
// Используется документом «Заказ покупателя» (document.tsx).

import { useCallback, useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useCoefficientCalculator } from "@/hooks/use-coefficient-calculator";
import type { Dealer, Fabric, Measurement, MeasurementSash } from "@shared/schema";
import { orderFormSchema, type OrderFormValues, type SashFormValues } from "./schemas";
import type {
  ComponentWithStock,
  CostCalculationDetails,
  FabricWithStock,
  OrderWithRelations,
  SystemWithComponents,
} from "./types";
import { calculateCostPrice } from "./utils";
import { normalizeSashRooms } from "./normalize-sash-rooms";

export type MeasurementWithSashes = Measurement & { sashes: MeasurementSash[]; dealerName?: string };

export const emptySash = (over: Partial<SashFormValues> = {}): SashFormValues => ({
  width: "",
  height: "",
  quantity: "1",
  systemId: "",
  controlSide: "",
  fabricId: "",
  sashPrice: "",
  sashCost: "",
  coefficient: "",
  isCalculating: false,
  room: 1,
  roomName: "",
  ...over,
});

export const emptyOrder = (): OrderFormValues => ({
  date: format(new Date(), "yyyy-MM-dd"),
  dealerId: "",
  status: "Новый",
  salePrice: "",
  costPrice: "",
  comment: "",
  isPaid: false,
  cashboxId: "",
  sashes: [emptySash()],
});

const num = (v: unknown) => (v == null || v === "" ? "" : parseFloat(String(v)).toString());

const sumPrices = (sashes: { sashPrice?: string; quantity?: string }[]) =>
  sashes.reduce((sum, s) => sum + parseFloat(s?.sashPrice || "0") * parseFloat(s?.quantity || "1"), 0);

interface Catalogs {
  dealers: (Dealer & { balance: number })[];
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  fabricStock: FabricWithStock[];
  componentStock: ComponentWithStock[];
}

export function useOrderEditor({ dealers, systems, fabrics, fabricStock, componentStock }: Catalogs) {
  const coefficientCalculator = useCoefficientCalculator();
  const [calculatingSashes, setCalculatingSashes] = useState<Set<number>>(new Set());
  const [isManualSalePrice, setIsManualSalePrice] = useState(false);
  const [costDetails, setCostDetails] = useState<CostCalculationDetails | null>(null);
  const [resetToken, setResetToken] = useState(0);
  // Число строк после загрузки: событие "sashes" без изменения числа строк — это
  // reset() при загрузке заказа, а не добавление/удаление (сумму тогда не трогаем).
  const lineCount = useRef(1);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: emptyOrder(),
  });
  const fieldArray = useFieldArray({ control: form.control, name: "sashes" });

  const stopCalculating = (index: number) =>
    setCalculatingSashes((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });

  /** Коэффициент из файла и цена створки = коэффициент × множитель системы. */
  const requestCoefficient = useCallback(
    (index: number, opts: { updatePrice: boolean; debounce: number }) => {
      const sash = form.getValues(`sashes.${index}`);
      if (!sash) return;
      const width = parseFloat(sash.width || "0");
      const height = parseFloat(sash.height || "0");
      if (!(width > 0 && height > 0 && sash.systemId && sash.fabricId)) return;
      const system = systems.find((s) => s.id === sash.systemId);
      const fabric = fabrics.find((f) => f.id === sash.fabricId);
      if (!system?.systemKey || !fabric?.category) return;

      setCalculatingSashes((prev) => new Set(prev).add(index));
      coefficientCalculator.calculate(
        { systemKey: system.systemKey, category: fabric.category, width: width / 100, height: height / 100 },
        (data) => {
          if (!form.getValues("sashes")[index]) return;
          form.setValue(`sashes.${index}.coefficient`, data.coefficient.toFixed(2), { shouldValidate: false });
          if (opts.updatePrice) {
            const multiplier = parseFloat(system.multiplier?.value?.toString() || "1") || 1;
            form.setValue(`sashes.${index}.sashPrice`, (data.coefficient * multiplier).toFixed(2), {
              shouldValidate: false,
              shouldDirty: true,
            });
            const total = sumPrices(form.getValues("sashes"));
            if (total > 0) form.setValue("salePrice", total.toFixed(2), { shouldValidate: false, shouldDirty: true });
          }
          stopCalculating(index);
        },
        () => {
          if (!form.getValues("sashes")[index]) return;
          stopCalculating(index);
          if (opts.updatePrice) {
            form.setValue(`sashes.${index}.sashPrice`, "0", { shouldValidate: false });
            form.setValue(`sashes.${index}.coefficient`, "", { shouldValidate: false });
          }
        },
        opts.debounce,
        `sash-${index}`
      );
    },
    [form, systems, fabrics, coefficientCalculator]
  );

  // Размеры / система / ткань изменил пользователь → новый коэффициент и цена створки.
  // reset() при загрузке заказа тоже шлёт имена полей, но без type — цены не трогаем.
  useEffect(() => {
    const sub = form.watch((_, { name, type }) => {
      if (type !== "change") return;
      const m = name?.match(/^sashes\.(\d+)\.(width|height|systemId|fabricId)$/);
      if (m) requestCoefficient(parseInt(m[1], 10), { updatePrice: true, debounce: 800 });
    });
    return () => {
      sub.unsubscribe();
      coefficientCalculator.cleanup();
    };
  }, [form, requestCoefficient, coefficientCalculator]);

  // Себестоимость по складу и сумма при изменении количества.
  useEffect(() => {
    const sub = form.watch((value, { name, type }) => {
      // Ввод пользователя в строке или добавление/удаление строк (name === "sashes").
      const lineEdit = type === "change" && !!name && /^sashes\.\d+\.(width|height|fabricId|systemId|quantity)$/.test(name);
      if (!name || (!lineEdit && name !== "sashes")) return;
      const sashes = (value.sashes || []) as SashFormValues[];
      if (name === "sashes") {
        if (sashes.length === lineCount.current) return;
        lineCount.current = sashes.length;
      }
      const { totalCost, sashDetails } = calculateCostPrice(sashes, (i) => sashes[i], fabricStock, componentStock, systems);
      setCostDetails({ totalCost, sashDetails });
      if (totalCost > 0 && Math.abs(totalCost - parseFloat(value.costPrice || "0")) > 0.01) {
        form.setValue("costPrice", totalCost.toFixed(2), { shouldValidate: false });
      }
      if (name.endsWith(".quantity") || name === "sashes") {
        const total = sumPrices(sashes);
        // Только если сумма изменилась: setValue внутри watch иначе зацикливается.
        if (total > 0 && !isManualSalePrice && Math.abs(total - parseFloat(value.salePrice || "0")) > 0.01) {
          form.setValue("salePrice", total.toFixed(2), { shouldValidate: false });
        }
      }
    });
    return () => sub.unsubscribe();
  }, [form, fabricStock, componentStock, systems, isManualSalePrice]);

  const recalcCost = useCallback(
    (sashes: SashFormValues[]) => {
      const { totalCost, sashDetails } = calculateCostPrice(sashes, (i) => sashes[i], fabricStock, componentStock, systems);
      setCostDetails({ totalCost, sashDetails });
      return totalCost;
    },
    [fabricStock, componentStock, systems]
  );

  /** Заказ с сервера → форма (каждая створка отдельной строкой). */
  const loadOrder = useCallback(
    (order: OrderWithRelations) => {
      setIsManualSalePrice(false);
      const sashes = normalizeSashRooms(
        (order.sashes || []).map((s) =>
          emptySash({
            id: s.id,
            productionStatus: s.productionStatus ?? null,
            productionReadyAt: s.productionReadyAt ?? null,
            width: num(s.width),
            height: num(s.height),
            systemId: s.systemId || "",
            controlSide: s.controlSide || "",
            fabricId: s.fabricId || "",
            sashPrice: num(s.sashPrice),
            sashCost: num(s.sashCost),
            coefficient: num(s.coefficient),
            room: s.room || 1,
            roomName: s.roomName || "",
            systemName: s.systemName || "",
            systemType: s.systemType || "",
            category: s.category || "",
            fabricName: s.fabricName || "",
          })
        )
      );
      lineCount.current = Math.max(1, sashes.length);
      form.reset({
        date: order.date,
        dealerId: order.dealerId || "",
        status: order.status || "Новый",
        salePrice: num(order.salePrice),
        costPrice: num(order.costPrice),
        comment: order.comment || "",
        isPaid: order.isPaid || false,
        cashboxId: order.cashboxId || "",
        sashes: sashes.length ? sashes : [emptySash()],
      });
      recalcCost(sashes);
      setResetToken((t) => t + 1);
      // Коэффициент для отображения — только где его нет; цены не трогаем.
      setTimeout(() => {
        sashes.forEach((s, i) => {
          if (!(parseFloat(s.coefficient || "0") > 0)) requestCoefficient(i, { updatePrice: false, debounce: 100 });
        });
      }, 100);
    },
    [form, recalcCost, requestCoefficient]
  );

  /** Замер из мобильного приложения → новый заказ. */
  const loadMeasurement = useCallback(
    (m: MeasurementWithSashes) => {
      setIsManualSalePrice(true); // коэффициент и цена — из приложения
      const client = [m.clientName, m.clientPhone].filter(Boolean);
      const comment = [
        client.length ? `Клиент: ${client.join(", ")}` : null,
        m.address ? `Адрес: ${m.address}` : null,
        m.comment ? `Примечание: ${m.comment}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      // systemType приложения → systemKey CRM
      const typeToKey: Record<string, string> = {
        "mini-rulons": "mini_roll",
        "mini-zebra": "mini_zebra",
        "uni-1": "uni1_roll",
        "uni-1-zebra": "uni1_zebra",
        "uni-2": "uni2_roll",
        "uni-2-zebra": "uni2_zebra",
      };
      const findSystemId = (s: MeasurementSash) => {
        if (s.systemName) {
          const byId = systems.find((x) => x.id === s.systemName);
          if (byId) return byId.id;
        }
        if (s.systemType) {
          const key = typeToKey[s.systemType] || s.systemType.replace(/-/g, "_");
          const byKey = systems.find((x) => x.systemKey === key);
          if (byKey) return byKey.id;
        }
        return "";
      };
      const findFabricId = (name: string | null | undefined) => {
        if (!name) return "";
        const exact = fabrics.find((f) => f.name === name);
        if (exact) return exact.id;
        const base = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
        const byBase = fabrics.find((f) => f.name === base);
        if (byBase) return byBase.id;
        return fabrics.find((f) => f.name.toLowerCase() === name.toLowerCase())?.id ?? "";
      };

      const dealer = dealers.find((d) => d.id === m.dealerId);
      const rateRulon = parseFloat(dealer?.workshopRateRulon?.toString() || "28");
      const rateZebra = parseFloat(dealer?.workshopRateZebra?.toString() || "28");
      let salePrice = 0;
      const sashes = normalizeSashRooms(
        (m.sashes || []).map((s) => {
          const coef = s.coefficient != null ? parseFloat(s.coefficient.toString()) : 0;
          const price = coef * ((s.systemType || "").includes("zebra") ? rateZebra : rateRulon);
          salePrice += price;
          return emptySash({
            width: num(s.width),
            height: num(s.height),
            systemId: findSystemId(s),
            controlSide: s.control === "Л" ? "ЛР" : s.control || "",
            fabricId: (s as { fabric?: { id?: string } }).fabric?.id || findFabricId(s.fabricName),
            sashPrice: price > 0 ? price.toFixed(2) : "",
            coefficient: coef > 0 ? coef.toString() : "",
            room: s.room || 1,
            roomName: s.roomName || "",
          });
        })
      );
      const totalCost = recalcCost(sashes);
      lineCount.current = Math.max(1, sashes.length);
      form.reset({
        ...emptyOrder(),
        dealerId: m.dealerId || "",
        salePrice: salePrice > 0 ? salePrice.toFixed(2) : "",
        costPrice: totalCost > 0 ? totalCost.toFixed(2) : "",
        comment,
        sashes: sashes.length ? sashes : [emptySash()],
      });
      setResetToken((t) => t + 1);
    },
    [form, dealers, systems, fabrics, recalcCost]
  );

  const resetNew = useCallback(() => {
    setIsManualSalePrice(false);
    setCostDetails(null);
    lineCount.current = 1;
    form.reset(emptyOrder());
    setResetToken((t) => t + 1);
  }, [form]);

  /** Проверка и данные для записи: ручная сумма раскладывается по створкам, кол-во > 1 размножается. */
  const buildPayload = useCallback(
    (data: OrderFormValues): { error: string } | { payload: OrderFormValues } => {
      const noCoefficient = data.sashes.filter(
        (s) =>
          parseFloat(s.width || "0") > 0 &&
          parseFloat(s.height || "0") > 0 &&
          s.systemId &&
          s.fabricId &&
          parseFloat(s.sashPrice || "0") === 0
      );
      if (noCoefficient.length) {
        return {
          error: `Створки без коэффициента (${noCoefficient.length} шт.): система не найдена в файле коэффициентов. Проверьте system_key в справочнике систем.`,
        };
      }

      let sashes = data.sashes;
      const manual = parseFloat(data.salePrice || "0");
      if (isManualSalePrice && manual > 0) {
        const auto = sumPrices(sashes);
        if (auto > 0) {
          const ratio = manual / auto;
          sashes = sashes.map((s) => ({ ...s, sashPrice: (parseFloat(s.sashPrice || "0") * ratio).toFixed(2) }));
        } else {
          const qty = sashes.reduce((sum, s) => sum + parseFloat(s.quantity || "1"), 0);
          if (qty > 0) sashes = sashes.map((s) => ({ ...s, sashPrice: (manual / qty).toFixed(2) }));
        }
      }

      const expanded = sashes.flatMap((s) =>
        Array.from({ length: Math.max(1, parseInt(s.quantity || "1", 10) || 1) }, (_, copy) => ({
          // Копии получают новые строки; первая сохраняет id (и состояние в производстве).
          id: copy === 0 ? s.id : undefined,
          width: s.width,
          height: s.height,
          quantity: "1",
          systemId: s.systemId,
          controlSide: s.controlSide,
          fabricId: s.fabricId,
          sashPrice: s.sashPrice,
          sashCost: s.sashCost,
          coefficient: s.coefficient,
          room: s.room || 1,
          roomName: s.roomName || undefined,
          systemName: s.systemName || undefined,
          systemType: s.systemType || undefined,
          category: s.category || undefined,
          fabricName: s.fabricName || undefined,
        }))
      );
      return { payload: { ...data, sashes: expanded } };
    },
    [isManualSalePrice]
  );

  const cleanupSash = useCallback(
    (index: number) => {
      const len = form.getValues("sashes").length;
      for (let i = index; i < len; i++) coefficientCalculator.cleanupSash(`sash-${i}`);
    },
    [form, coefficientCalculator]
  );

  return {
    form,
    fieldArray,
    calculatingSashes,
    isManualSalePrice,
    setIsManualSalePrice,
    costDetails,
    setCostDetails,
    resetToken,
    loadOrder,
    loadMeasurement,
    resetNew,
    buildPayload,
    cleanupSash,
    totalOfLines: () => sumPrices(form.getValues("sashes")),
  };
}
