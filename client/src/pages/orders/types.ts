import type {
  Order,
  Dealer,
  System,
  Fabric,
  Color,
  Multiplier,
  Component,
} from "@shared/schema";

export interface OrderSash {
  id: string;
  orderId: string;
  width: string | null;
  height: string | null;
  systemId: string | null;
  systemColorId: string | null;
  fabricId: string | null;
  fabricColorId: string | null;
  controlSide: string | null;
  sashPrice: string | null;
  sashCost: string | null;
  // Mobile-app fallback fields: populated when an order is created from a
  // mobile measurement and the dealer's selection doesn't map to a catalogue
  // entry (systemId/fabricId stay NULL).
  systemName: string | null;
  systemType: string | null;
  category: string | null;
  fabricName: string | null;
  system?: System;
  systemColor?: Color;
  fabric?: Fabric;
  fabricColor?: Color;
}

export type OrderType = "sash" | "product";

export interface OrderWithRelations extends Order {
  dealer?: Dealer;
  dealerBalance?: number;
  dealerShippedDebt?: number;
  sashesCount?: number;
  sashes?: OrderSash[];
  orderType?: OrderType;
  isPaid?: boolean;
  cashboxId?: string | null;
  // Уникальные id тканей заказа — нужны для детектора «нет цены за ткань»
  // (блокирует отгрузку и подсвечивает карточку заказа).
  fabricIds?: string[];
}

export interface StockItem {
  quantity: number;
  lastPrice: number;
  avgPrice: number;
  totalValue: number;
}

export interface FabricWithStock extends Fabric {
  stock?: StockItem;
}

export interface ComponentWithStock extends Component {
  stock?: StockItem;
}

export interface SystemComponentWithDetails extends Component {
  quantity?: string | null;
  sizeSource?: string | null;
  sizeMultiplier?: string | null;
}

export interface SystemWithComponents extends System {
  components?: SystemComponentWithDetails[];
  multiplier?: Multiplier;
}

export interface CostCalculationDetails {
  totalCost: number;
  sashDetails: Array<{
    index: number;
    width: number;
    height: number;
    quantity: number;
    fabricId: string | null;
    fabricName: string;
    fabricType: string;
    fabricAvgPrice: number;
    fabricCost: number;
    fabricMultiplier: number;
    componentsCost: number;
    componentsDetails: Array<{
      name: string;
      unit: string;
      quantity: number;
      sizeSource: string | null;
      sizeMultiplier: number;
      sizeValue: number;
      avgPrice: number;
      totalPrice: number;
      formula: string;
    }>;
    sashCost: number;
    sashFixedCost: number;
    totalSashCost: number;
  }>;
}

export interface Room {
  id: number;
  name: string;
}
