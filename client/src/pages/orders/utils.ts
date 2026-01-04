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
      const widthM = width / 1000;
      const heightM = height / 1000;
      const areaM2 = widthM * heightM;

      if (fabricId) {
        const fabric = fabricStock.find((f) => f.id === fabricId);
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
            if (compStock && compStock.stock.avgPrice > 0) {
              const quantity = parseFloat(component.quantity || "1");
              const sizeSource = component.sizeSource || null;
              const sizeMultiplier = parseFloat(
                component.sizeMultiplier || "1"
              );
              const unit = compStock.unit || "шт";

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
                componentPrice =
                  compStock.stock.avgPrice *
                  sizeValue *
                  sizeMultiplier *
                  quantity;
                formula = `${compStock.stock.avgPrice.toFixed(
                  2
                )} × ${sizeValue.toFixed(3)}м × ${sizeMultiplier} × ${quantity}`;
              } else if (isMetric && !sizeSource) {
                sizeValue = widthM;
                componentPrice =
                  compStock.stock.avgPrice *
                  sizeValue *
                  sizeMultiplier *
                  quantity;
                formula = `${compStock.stock.avgPrice.toFixed(
                  2
                )} × ${sizeValue.toFixed(
                  3
                )}м (ширина) × ${sizeMultiplier} × ${quantity}`;
              } else {
                componentPrice = compStock.stock.avgPrice * quantity;
                formula = `${compStock.stock.avgPrice.toFixed(
                  2
                )} × ${quantity}шт`;
              }

              componentsCost += componentPrice;
              componentsDetails.push({
                name: compStock.name,
                unit,
                quantity,
                sizeSource,
                sizeMultiplier,
                sizeValue,
                avgPrice: compStock.stock.avgPrice,
                totalPrice: componentPrice,
                formula,
              });
            }
          }
          sashCost += componentsCost;
        }
      }

      totalCost += sashCost;

      sashDetails.push({
        index: i + 1,
        width,
        height,
        fabricName,
        fabricType,
        fabricAvgPrice,
        fabricCost,
        fabricMultiplier,
        componentsCost,
        componentsDetails,
        sashCost,
      });
    }
  }

  return { totalCost, sashDetails };
}

export function printInvoice(order: OrderWithRelations): void {
  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>Счет #${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Счет #${order.orderNumber}</h1>
        <p>Дата: ${format(new Date(order.date), "dd.MM.yyyy")}</p>
        <p>Дилер: ${order.dealer?.fullName || "-"}</p>
        <table>
          <tr><th>Позиция</th><th>Створки</th><th>Сумма</th></tr>
          <tr><td>Заказ #${order.orderNumber}</td><td>${
    order.sashesCount || 1
  }</td><td>${formatCurrency(order.salePrice)}</td></tr>
        </table>
        <p class="total">Итого к оплате: ${formatCurrency(order.salePrice)}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
}

