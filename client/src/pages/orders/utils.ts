import { format } from "date-fns";
import { formatCurrency } from "@/components/status-badge";
import type {
  OrderWithRelations,
  FabricWithStock,
  ComponentWithStock,
  SystemWithComponents,
  CostCalculationDetails,
} from "./types";

interface SashData {
  width?: string;
  height?: string;
  quantity?: string;
  fabricId?: string;
  systemId?: string;
}

export function calculateCostPrice(
  sashesData: SashData[],
  getSashValues: (index: number) => SashData | undefined,
  fabricStock: FabricWithStock[],
  componentStock: ComponentWithStock[],
  systems: SystemWithComponents[]
): { totalCost: number; sashDetails: CostCalculationDetails["sashDetails"] } {
  let totalCost = 0;
  const sashDetails: CostCalculationDetails["sashDetails"] = [];

  for (let i = 0; i < sashesData.length; i++) {
    const sash = getSashValues(i);
    if (!sash) continue;

    const width = parseFloat(sash.width || "0");
    const height = parseFloat(sash.height || "0");
    const quantity = parseFloat(sash.quantity || "1");
    const fabricId = sash.fabricId;
    const systemId = sash.systemId;

    let sashCost = 0;
    let fabricCost = 0;
    let fabricMultiplier = 1;
    let componentsCost = 0;
    const componentsDetails: CostCalculationDetails["sashDetails"][0]["componentsDetails"] =
      [];
    let fabricName = "";
    let fabricType = "roll";
    let fabricAvgPrice = 0;

    if (width > 0 && height > 0) {
      const widthM = width / 100;
      const heightM = height / 100;
      const areaM2 = widthM * heightM;

      if (fabricId) {
        const fabric: any = fabricStock.find((f) => f.id === fabricId);
        if (fabric) {
          fabricName = fabric.name;
          fabricType = fabric.fabricType || "roll";
          fabricAvgPrice = fabric.stock.avgPrice;
          fabricMultiplier = fabricType === "zebra" ? 2 : 1;

          if (fabric.stock.avgPrice > 0) {
            fabricCost = areaM2 * fabric.stock.avgPrice * fabricMultiplier;
            sashCost += fabricCost;
          }
        }
      }

      if (systemId) {
        const system = systems.find((s) => s.id === systemId);
        if (system && system.components) {
          for (const component of system.components) {
            const compStock = componentStock.find((c) => c.id === component.id);
            const quantity = parseFloat(component.quantity || "1");
            const sizeSource = component.sizeSource || null;
            const sizeMultiplier = parseFloat(
              component.sizeMultiplier || "1"
            );
            const unit = compStock?.unit || component.unit || "шт";
            const avgPrice = compStock?.stock?.avgPrice || 0;

            let sizeValue = 1;
            let componentPrice = 0;
            let formula = "";

            const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
              unit.toLowerCase()
            );

            if (isMetric && sizeSource) {
              if (sizeSource === "width") {
                sizeValue = widthM;
              } else if (sizeSource === "height") {
                sizeValue = heightM;
              }
              if (avgPrice > 0) {
                componentPrice =
                  avgPrice *
                  sizeValue *
                  sizeMultiplier *
                  quantity;
                formula = `${avgPrice.toFixed(
                  2
                )} × ${sizeValue.toFixed(
                  3
                )}м × ${sizeMultiplier} × ${quantity}`;
              } else {
                formula = `нет цены`;
              }
            } else if (isMetric && !sizeSource) {
              sizeValue = widthM;
              if (avgPrice > 0) {
                componentPrice =
                  avgPrice *
                  sizeValue *
                  sizeMultiplier *
                  quantity;
                formula = `${avgPrice.toFixed(
                  2
                )} × ${sizeValue.toFixed(
                  3
                )}м (ширина) × ${sizeMultiplier} × ${quantity}`;
              } else {
                formula = `нет цены`;
              }
            } else {
              if (avgPrice > 0) {
                componentPrice = avgPrice * quantity;
                formula = `${avgPrice.toFixed(
                  2
                )} × ${quantity}шт`;
              } else {
                formula = `нет цены`;
              }
            }

            componentsCost += componentPrice;
            componentsDetails.push({
              name: compStock?.name || component.name || "Комплектующее",
              unit,
              quantity,
              sizeSource,
              sizeMultiplier,
              sizeValue,
              avgPrice,
              totalPrice: componentPrice,
              formula,
            });
          }
          sashCost += componentsCost;
        }
      }

      // Фиксированная надбавка 150 рублей за каждую створку
      const sashFixedCost = 150;
      sashCost += sashFixedCost;

      const totalSashCost = sashCost * quantity;
      totalCost += totalSashCost;

      sashDetails.push({
        index: i + 1,
        width,
        height,
        quantity,
        fabricName,
        fabricType,
        fabricAvgPrice,
        fabricCost,
        fabricMultiplier,
        componentsCost,
        componentsDetails,
        sashCost,
        sashFixedCost,
        totalSashCost,
      });
    }
  }

  return { totalCost, sashDetails };
}

const CONTROL_SIDE_LABELS: Record<string, string> = {
  лр: "Левое",
  лево: "Левое",
  левый: "Левое",
  left: "Левое",
  пр: "Правое",
  право: "Правое",
  правый: "Правое",
  right: "Правое",
};

const formatDimension = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${parseFloat(value.toString())} см`;
};

const mapControlSide = (value?: string | null) => {
  if (!value) return "—";
  const normalized = value.trim().toLowerCase();
  return CONTROL_SIDE_LABELS[normalized] || value;
};

const fetchUserBrand = async (): Promise<string> => {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return "Исполнитель";
    const data = await res.json();
    return data.user?.name || data.user?.email || "Исполнитель";
  } catch {
    return "Исполнитель";
  }
};

const fetchDealerInfo = async (dealerId?: string | null) => {
  if (!dealerId) return { dealerName: "—", dealerPhone: "", debt: 0 };
  try {
    const res = await fetch("/api/dealers", { credentials: "include" });
    if (!res.ok) return { dealerName: "—", dealerPhone: "", debt: 0 };
    const list = (await res.json()) as Array<{
      id: string;
      fullName: string;
      phone?: string | null;
      balance?: number;
    }>;
    const dealer = list.find((d) => d.id === dealerId);
    return {
      dealerName: dealer?.fullName || "—",
      dealerPhone: dealer?.phone || "",
      debt:
        dealer && dealer.balance && dealer.balance < 0
          ? Math.abs(dealer.balance)
          : 0,
    };
  } catch {
    return { dealerName: "—", dealerPhone: "", debt: 0 };
  }
};

export async function printInvoice(order: OrderWithRelations): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) return;

  let fullOrder: any = order;

  // Подтягиваем полный заказ с расшифровкой створок, если их нет в краткой выдаче
  if (!order.sashes || order.sashes.length === 0 || !order.dealer) {
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        fullOrder = (await res.json()) as OrderWithRelations;
      }
    } catch (error) {
      console.error("Не удалось загрузить заказ для печати", error);
    }
  }

  const dealerName = fullOrder.dealer?.fullName || "—";
  const orderNumber = fullOrder.orderNumber || "";
  const orderDate = fullOrder.date
    ? format(new Date(fullOrder.date), "dd.MM.yyyy")
    : "";
  const sashes = fullOrder.sashes || [];
  const totalAmount = formatCurrency(
    parseFloat((fullOrder.salePrice as any) || "0")
  );

  const isProductOrder =
    fullOrder.orderType === "product" ||
    (sashes.length > 0 &&
      sashes.every((s: any) => !!s.componentId && !s.systemId && !s.fabricId));

  if (isProductOrder) {
    // Для заказов комплектующих выводим другую таблицу
    let componentsDirectory: Record<
      string,
      { name: string; unit?: string }
    > | null = null;

    const parseCommentQuantities = (comment?: string) => {
      const result = new Map<string, number>();
      if (!comment) return result;
      const match = comment.match(/\[Товар:\s*([^\]]+)\]/i);
      if (!match) return result;
      const items = match[1].split(",");
      items.forEach((item) => {
        const trimmed = item.trim();
        const itemMatch = trimmed.match(/(.+?)\s*x\s*([\d.,]+)/i);
        if (itemMatch) {
          const name = itemMatch[1].trim().toLowerCase();
          const qty = parseFloat(itemMatch[2].replace(",", "."));
          if (!Number.isNaN(qty)) {
            result.set(name, (result.get(name) || 0) + qty);
          }
        }
      });
      return result;
    };

    const commentQuantities = parseCommentQuantities(fullOrder.comment);

    try {
      const res = await fetch("/api/components", { credentials: "include" });
      if (res.ok) {
        const list = (await res.json()) as Array<{
          id: string;
          name: string;
          unit?: string | null;
        }>;
        componentsDirectory = list.reduce((acc, item) => {
          acc[item.id] = { name: item.name, unit: item.unit || "шт." };
          return acc;
        }, {} as Record<string, { name: string; unit?: string }>);
      }
    } catch (error) {
      console.error("Не удалось загрузить список комплектующих", error);
    }

    type GroupedComponent = {
      name: string;
      unit: string;
      quantity: number;
    };

    const groupedComponents = new Map<string, GroupedComponent>();

    sashes.forEach((sash: any) => {
      const compId = sash.componentId || "unknown";
      const dir = (componentsDirectory && componentsDirectory[compId]) || null;
      const name = dir?.name || "Комплектующее";
      const unit = dir?.unit || "шт.";
      const qtyFromSash = parseFloat((sash as any).quantity || "NaN");
      const qtyFromComment = commentQuantities.get(name.toLowerCase());
      const qty =
        !Number.isNaN(qtyFromSash) && qtyFromSash > 0
          ? qtyFromSash
          : qtyFromComment && qtyFromComment > 0
          ? qtyFromComment
          : 1;

      const key = `${name}|${unit}`;
      const existing = groupedComponents.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        groupedComponents.set(key, { name, unit, quantity: qty });
      }
    });

    const rows =
      groupedComponents.size > 0
        ? Array.from(groupedComponents.values()).map((item, index) => {
            return `
              <tr>
                <td class="center">${index + 1}</td>
                <td class="left">${item.name}</td>
                <td class="center">${item.quantity}</td>
                <td class="center">${item.unit}</td>
              </tr>
            `;
          })
        : [
            `<tr><td class="center">1</td><td colspan="3" class="left">Позиции заказа отсутствуют</td></tr>`,
          ];

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Накладная заказа № ${orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
            p { margin: 0 0 6px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            th, td { border: 1px solid #6b7280; padding: 6px 8px; }
            th { background: #f3f4f6; font-weight: 600; text-align: center; }
            td.center { text-align: center; }
            td.left { text-align: left; }
            .total { font-size: 15px; font-weight: 700; margin-top: 12px; text-align: right; }
          </style>
        </head>
        <body>
          <p>Диллер <strong>${dealerName}</strong></p>
          <p>Накладная заказа № <strong>${orderNumber}</strong></p>
          <p>Дата заказа <strong>${orderDate}</strong></p>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">№</th>
                <th>Наименование</th>
                <th style="width: 120px;">Количество</th>
                <th style="width: 100px;">Ед.</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>

          <div class="total">Итого к оплате: ${totalAmount}</div>
        </body>
      </html>
    `);

    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 150);

    return;
  }

  // Заказы со створками — технологическая карта
  type SashLine = {
    width: number | null;
    height: number | null;
    system: string;
    fabric: string;
    control: string;
    room: number;
    roomName: string;
  };

  const sashLines: SashLine[] = [];

  sashes.forEach((sash: any) => {
    const widthNum =
      sash.width !== null && sash.width !== undefined
        ? parseFloat(sash.width.toString())
        : null;
    const heightNum =
      sash.height !== null && sash.height !== undefined
        ? parseFloat(sash.height.toString())
        : null;

    const systemParts = [
      sash.system?.name || "",
      sash.systemColor?.name || "",
    ].filter(Boolean);
    const fabricParts = [
      sash.fabric?.name || "",
      sash.fabricColor?.name || "",
    ].filter(Boolean);
    if (sash.fabric?.fabricType?.toLowerCase() === "zebra") {
      fabricParts.push("(зеб)");
    }

    const systemText = systemParts.join(" ").trim() || "—";
    const fabricText = fabricParts.join(" ").trim() || "—";
    const controlText = mapControlSide(sash.controlSide);
    const room = sash.room || 1;
    const roomName = sash.roomName || "";

    sashLines.push({
      width: widthNum,
      height: heightNum,
      system: systemText,
      fabric: fabricText,
      control: controlText,
      room,
      roomName,
    });
  });

  // Группируем по комнатам (по roomName)
  const rooms = new Map<string, { items: SashLine[] }>();
  sashLines.forEach((item) => {
    const key = item.roomName || "";
    const existing = rooms.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      rooms.set(key, { items: [item] });
    }
  });

  const sortedRooms = Array.from(rooms.entries());
  const hasMultipleRooms = sortedRooms.filter(([name]) => name).length > 1 || (sortedRooms.length > 1);

  let globalIndex = 0;
  const tableBody = sortedRooms
    .map(([roomName, { items }]) => {
      const displayName = roomName || "Без комнаты";
      const roomHeader = hasMultipleRooms
        ? `<tr><td colspan="6" class="room-header">${displayName}</td></tr>`
        : "";
      const itemRows = items.map((item) => {
        globalIndex++;
        return `
          <tr>
            <td class="center">${globalIndex}</td>
            <td class="center">${formatDimension(item.width)}</td>
            <td class="center">${formatDimension(item.height)}</td>
            <td class="left">${item.system}</td>
            <td class="left">${item.fabric}</td>
            <td class="center">${item.control}</td>
          </tr>
        `;
      });
      return roomHeader + itemRows.join("");
    })
    .join("");

  const rows =
    sashLines.length > 0
      ? tableBody
      : `<tr><td class="center">1</td><td colspan="5" class="left">Позиции заказа отсутствуют</td></tr>`;

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Технологическая карта заказа № ${orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
          p { margin: 0 0 6px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #6b7280; padding: 6px 8px; }
          th { background: #f3f4f6; font-weight: 600; text-align: center; }
          td.center { text-align: center; }
          td.left { text-align: left; }
          .room-header { background: #e5e7eb; font-weight: 600; text-align: left; font-size: 13px; padding: 8px; }
          .total { font-size: 15px; font-weight: 700; margin-top: 12px; text-align: right; }
        </style>
      </head>
      <body>
        <p>Диллер <strong>${dealerName}</strong></p>
        <p>Технологическая карта заказа № <strong>${orderNumber}</strong></p>
        <p>Дата заказа <strong>${orderDate}</strong></p>

        <table>
          <thead>
            <tr>
              <th style="width: 40px;">№</th>
              <th style="width: 70px;">Ширина</th>
              <th style="width: 70px;">Высота</th>
              <th>Система</th>
              <th>Ткань</th>
              <th style="width: 90px;">Управление</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        ${await buildCuttingHtml(order.id)}
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

async function buildCuttingHtml(orderId: string): Promise<string> {
  try {
    const res = await fetch(`/api/orders/${orderId}/cutting`, { credentials: "include" });
    if (!res.ok) return "";
    const layouts = await res.json();
    if (!layouts || layouts.length === 0) return "";

    const sections = layouts.map((layout: any) => {
      const rollW = parseFloat(layout.rollWidth);
      const totalLen = parseFloat(layout.totalLength);
      const waste = parseFloat(layout.wastePercent);

      const rowsHtml = (layout.rows || []).map((row: any) => {
        const cutLen = parseFloat(row.cutLength);
        const usedW = parseFloat(row.usedWidth);
        const scale = 600 / rollW;
        const maxH = 80;

        const piecesVisual = (row.pieces || []).map((p: any) => {
          const w = p.width * scale;
          const h = Math.round((p.height / cutLen) * maxH);
          const bgColor = p.height < cutLen ? "#fef3c7" : "#dcfce7";
          return `<div style="width:${w}px;height:${h}px;background:${bgColor};border:1px solid #6b7280;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;align-self:flex-end">${p.width}x${p.height}</div>`;
        }).join("");

        const wasteW = rollW - usedW;
        const wasteVisual = wasteW > 0
          ? `<div style="width:${wasteW * scale}px;height:${maxH}px;background:#fee2e2;border:1px dashed #ef4444;display:flex;align-items:center;justify-content:center;font-size:10px;color:#ef4444;flex-shrink:0;align-self:flex-end">${wasteW.toFixed(0)} см</div>`
          : "";

        return `
          <div style="margin-bottom:12px">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px">
              Ряд ${row.rowIndex} — отрез ${cutLen} см
              <span style="color:#6b7280;font-weight:400"> (занято ${usedW.toFixed(0)} из ${rollW} см)</span>
            </div>
            <div style="display:flex;align-items:flex-end;border:2px solid #374151;width:${rollW * scale}px;height:${maxH}px">${piecesVisual}${wasteVisual}</div>
          </div>
        `;
      }).join("");

      return `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 8px">${layout.fabricName || "Ткань"}</h3>
          <p style="margin:0 0 4px;font-size:13px">Ширина рулона: <strong>${rollW} см</strong></p>
          <p style="margin:0 0 12px;font-size:13px">Итого: <strong>${(totalLen / 100).toFixed(2)} п.м.</strong> | Отходы: <strong>${waste.toFixed(1)}%</strong></p>
          ${rowsHtml}
        </div>
      `;
    }).join('<hr style="margin:16px 0">');

    return `
      <hr style="margin:24px 0;border:none;border-top:2px solid #374151">
      <h2 style="margin:0 0 16px;font-size:18px">Раскрой</h2>
      ${sections}
    `;
  } catch {
    return "";
  }
}

export async function printCustomerInvoice(
  order: OrderWithRelations
): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) return;

  let fullOrder = order;

  // Подтягиваем полный заказ с расшифровкой створок, если их нет в краткой выдаче
  if (!order.sashes || order.sashes.length === 0 || !order.dealer) {
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        fullOrder = (await res.json()) as OrderWithRelations;
      }
    } catch (error) {
      console.error("Не удалось загрузить заказ для печати (клиент)", error);
    }
  }

  const orderNumber = fullOrder.orderNumber || "";
  const orderDate = fullOrder.date
    ? format(new Date(fullOrder.date), "dd.MM.yyyy")
    : "";
  const sashes = fullOrder.sashes || [];
  const totalAmountNum = parseFloat((fullOrder.salePrice as any) || "0") || 0;
  const totalAmount = formatCurrency(totalAmountNum);
  const brandName = await fetchUserBrand();
  const { dealerName, dealerPhone, debt } = await fetchDealerInfo(
    fullOrder.dealerId
  );
  const debtFormatted = `${formatCurrency(debt).replace(" ", "\u00a0")} руб.`;

  // Загружаем системы с множителями для расчёта коэффициентов
  let systemsWithMultipliers: Array<{
    id: string;
    multiplier?: { value: string | number | null } | null;
  }> = [];
  try {
    const sysRes = await fetch("/api/systems", { credentials: "include" });
    if (sysRes.ok) {
      systemsWithMultipliers = await sysRes.json();
    }
  } catch {
    // Если не удалось загрузить — коэффициенты не покажем
  }

  const getMultiplierValue = (systemId?: string | null): number => {
    if (!systemId) return 1;
    const sys = systemsWithMultipliers.find((s) => s.id === systemId);
    const val = parseFloat(sys?.multiplier?.value?.toString() || "1");
    return val > 0 ? val : 1;
  };

  if (
    fullOrder.orderType === "product" ||
    (sashes.length > 0 &&
      sashes.every((s: any) => !!s.componentId && !s.systemId && !s.fabricId))
  ) {
    // Накладная для заказчика по комплектующим
    let componentsDirectory: Record<
      string,
      { name: string; unit?: string }
    > | null = null;

    try {
      const res = await fetch("/api/components", { credentials: "include" });
      if (res.ok) {
        const list = (await res.json()) as Array<{
          id: string;
          name: string;
          unit?: string | null;
        }>;
        componentsDirectory = list.reduce((acc, item) => {
          acc[item.id] = { name: item.name, unit: item.unit || "шт." };
          return acc;
        }, {} as Record<string, { name: string; unit?: string }>);
      }
    } catch (error) {
      console.error("Не удалось загрузить список комплектующих", error);
    }

    const totalQty = sashes.reduce((sum, s) => {
      const qty = parseFloat((s as any).quantity || "1");
      return sum + (Number.isNaN(qty) ? 1 : qty);
    }, 0);
    const unitFallback = totalQty > 0 ? totalAmountNum / totalQty : 0;

    type GroupedComp = {
      name: string;
      unit: string;
      quantity: number;
      price: number;
      sum: number;
    };
    const grouped = new Map<string, GroupedComp>();

    sashes.forEach((sash: any) => {
      const compId = sash.componentId || "unknown";
      const dir = (componentsDirectory && componentsDirectory[compId]) || null;
      const name = dir?.name || "Комплектующее";
      const unit = dir?.unit || "шт.";
      const qty = parseFloat((sash as any).quantity || "NaN");
      const quantity = !Number.isNaN(qty) && qty > 0 ? qty : 1;
      const price = unitFallback;

      const key = `${name}|${unit}|${price.toFixed(4)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.sum = existing.quantity * existing.price;
      } else {
        grouped.set(key, {
          name,
          unit,
          quantity,
          price,
          sum: quantity * price,
        });
      }
    });

    const rows =
      grouped.size > 0
        ? Array.from(grouped.values()).map((item, index) => {
            return `
              <tr>
                <td class="center">${index + 1}</td>
                <td class="left" colspan="3">${item.name}</td>
                <td class="center">${item.quantity}</td>
                <td class="center">${item.unit}</td>
                <td class="center">${formatCurrency(item.price)}</td>
                <td class="center">${formatCurrency(item.sum)}</td>
              </tr>
            `;
          })
        : [
            `<tr><td class="center">1</td><td colspan="7" class="left">Позиции заказа отсутствуют</td></tr>`,
          ];

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Накладная для заказчика № ${orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
            p { margin: 0 0 6px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            th, td { border: 1px solid #6b7280; padding: 6px 8px; }
            th { background: #f3f4f6; font-weight: 600; text-align: center; }
            td.center { text-align: center; }
            td.left { text-align: left; }
            .total-row { font-size: 15px; font-weight: 700; text-align: right; margin-top: 12px; }
            .debt { border: 1px solid #d32f2f; border-radius: 4px; padding: 10px 12px; margin-top: 16px; display: inline-block; }
          </style>
        </head>
        <body>
          <p>Заказ № <strong>${orderNumber}</strong></p>
          <p>Дата заказа: <strong>${orderDate}</strong></p>
          <p>Исполнитель: <strong>${brandName}</strong></p>
          <p>Покупатель: <strong>${dealerName}</strong></p>
          ${dealerPhone ? `<p>Тел: ${dealerPhone}</p>` : ""}

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">№</th>
                <th colspan="3">Наименование</th>
                <th style="width: 90px;">Количество</th>
                <th style="width: 90px;">Ед.</th>
                <th style="width: 90px;">Цена</th>
                <th style="width: 100px;">Сумма</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>

          <p class="total-row">Итого: ${totalAmount}</p>
          <div class="debt">
            Текущий долг с ожидаемыми отгрузками: <strong>${debtFormatted}</strong>
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
    return;
  }

  // Заказ со створками — накладная для заказчика
  const totalSashes = sashes.length || 1;
  const unitFallback = totalSashes > 0 ? totalAmountNum / totalSashes : 0;

  type SashLineCustomer = {
    width: number | null;
    height: number | null;
    system: string;
    fabric: string;
    control: string;
    unitPrice: number;
    coefficient: number;
    room: number;
    roomName: string;
  };

  const sashLines: SashLineCustomer[] = [];

  sashes.forEach((sash) => {
    const widthNum =
      sash.width !== null && sash.width !== undefined
        ? parseFloat(sash.width.toString())
        : null;
    const heightNum =
      sash.height !== null && sash.height !== undefined
        ? parseFloat(sash.height.toString())
        : null;

    const systemParts = [
      sash.system?.name || "",
      sash.systemColor?.name || "",
    ].filter(Boolean);
    const fabricParts = [
      sash.fabric?.name || "",
      sash.fabricColor?.name || "",
    ].filter(Boolean);
    if (sash.fabric?.fabricType?.toLowerCase() === "zebra") {
      fabricParts.push("(зеб)");
    }

    const systemText = systemParts.join(" ").trim() || "—";
    const fabricText = fabricParts.join(" ").trim() || "—";
    const controlText = mapControlSide(sash.controlSide);
    const room = (sash as any).room || 1;
    const roomName = (sash as any).roomName || "";

    const unitPriceRaw = parseFloat((sash as any).sashPrice || "NaN");
    const unitPrice =
      !Number.isNaN(unitPriceRaw) && unitPriceRaw > 0
        ? unitPriceRaw
        : unitFallback;

    // Берём сохранённый коэффициент (не вычисляем из цены)
    const savedCoefficient = parseFloat((sash as any).coefficient || "0");
    const coefficient = savedCoefficient;

    sashLines.push({
      width: widthNum,
      height: heightNum,
      system: systemText,
      fabric: fabricText,
      control: controlText,
      unitPrice,
      coefficient,
      room,
      roomName,
    });
  });

  // Общий коэффициент
  let totalCoefficient = 0;
  sashLines.forEach((item) => {
    totalCoefficient += item.coefficient;
  });

  // Группируем по комнатам (по roomName)
  const customerRooms = new Map<string, { items: SashLineCustomer[] }>();
  sashLines.forEach((item) => {
    const key = item.roomName || "";
    const existing = customerRooms.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      customerRooms.set(key, { items: [item] });
    }
  });

  const sortedCustomerRooms = Array.from(customerRooms.entries());
  const hasMultipleCustomerRooms = sortedCustomerRooms.filter(([name]) => name).length > 1 || (sortedCustomerRooms.length > 1);

  let customerGlobalIndex = 0;
  const customerTableBody = sortedCustomerRooms
    .map(([rName, { items }]) => {
      const displayName = rName || "Без комнаты";
      const roomHeader = hasMultipleCustomerRooms
        ? `<tr><td colspan="8" class="room-header">${displayName}</td></tr>`
        : "";
      const itemRows = items.map((item) => {
        customerGlobalIndex++;
        return `
          <tr>
            <td class="center">${customerGlobalIndex}</td>
            <td class="center">${formatDimension(item.width)}</td>
            <td class="center">${formatDimension(item.height)}</td>
            <td class="left">${item.system}</td>
            <td class="left">${item.fabric}</td>
            <td class="center">${item.control}</td>
            <td class="center">${item.coefficient > 0 ? item.coefficient.toFixed(2) : "—"}</td>
            <td class="center">${formatCurrency(item.unitPrice)}</td>
          </tr>
        `;
      });
      return roomHeader + itemRows.join("");
    })
    .join("");

  const rows =
    sashLines.length > 0
      ? customerTableBody
      : `<tr><td class="center">1</td><td colspan="7" class="left">Позиции заказа отсутствуют</td></tr>`;

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Накладная для заказчика № ${orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
          p { margin: 0 0 6px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border: 1px solid #6b7280; padding: 6px 8px; }
          th { background: #f3f4f6; font-weight: 600; text-align: center; }
          td.center { text-align: center; }
          td.left { text-align: left; }
          .room-header { background: #e5e7eb; font-weight: 600; text-align: left; font-size: 13px; padding: 8px; }
          .total-row { font-size: 15px; font-weight: 700; text-align: right; margin-top: 12px; }
          .coeff-total { font-size: 14px; font-weight: 600; margin-top: 8px; text-align: right; }
          .debt { border: 1px solid #d32f2f; border-radius: 4px; padding: 10px 12px; margin-top: 16px; display: inline-block; }
        </style>
      </head>
      <body>
        <p>Заказ № <strong>${orderNumber}</strong></p>
        <p>Дата заказа: <strong>${orderDate}</strong></p>
        <p>Исполнитель: <strong>${brandName}</strong></p>
        <p>Покупатель: <strong>${dealerName}</strong></p>
        ${dealerPhone ? `<p>Тел: ${dealerPhone}</p>` : ""}

        <table>
          <thead>
            <tr>
              <th style="width: 40px;">№</th>
              <th style="width: 50px;">ширина</th>
              <th style="width: 50px;">высота</th>
              <th>Наименование</th>
              <th>ткань</th>
              <th style="width: 30px;">управление</th>
              <th style="width: 80px;">Коэфф.</th>
              <th style="width: 95px;">Цена</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        ${totalCoefficient > 0 ? `<p class="coeff-total">Общий коэффициент: ${totalCoefficient.toFixed(2)}</p>` : ""}
        <p class="total-row">Итого: ${totalAmount}</p>
        <div class="debt">
          Текущий долг с ожидаемыми отгрузками: <strong>${debtFormatted}</strong>
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

export function printInvoicePreview(data: {
  date: string;
  dealerName: string;
  sashes: Array<{ quantity?: string }>;
  salePrice: string;
  comment?: string;
}): void {
  const win = window.open("", "_blank");
  if (!win) return;

  const totalSashes = data.sashes.reduce((sum, sash) => {
    return sum + parseFloat(sash.quantity || "1");
  }, 0);

  win.document.write(`
    <html>
      <head>
        <title>Предпросмотр накладной</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { margin-bottom: 20px; }
          .preview-badge { 
            display: inline-block;
            background: #fef3c7; 
            color: #92400e;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 14px;
            margin-left: 10px;
          }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
          .comment { margin-top: 20px; padding: 10px; background: #f9fafb; border-left: 3px solid #3b82f6; }
        </style>
      </head>
      <body>
        <h1>Предпросмотр накладной<span class="preview-badge">Черновик</span></h1>
        <p>Дата: ${format(new Date(data.date), "dd.MM.yyyy")}</p>
        <p>Дилер: ${data.dealerName || "-"}</p>
        <table>
          <tr><th>Позиция</th><th>Створки</th><th>Сумма</th></tr>
          <tr><td>Новый заказ</td><td>${totalSashes}</td><td>${formatCurrency(
    parseFloat(data.salePrice || "0")
  )}</td></tr>
        </table>
        <p class="total">Итого к оплате: ${formatCurrency(
          parseFloat(data.salePrice || "0")
        )}</p>
        ${
          data.comment
            ? `<div class="comment"><strong>Комментарий:</strong><br>${data.comment}</div>`
            : ""
        }
      </body>
    </html>
  `);
  win.document.close();
}
