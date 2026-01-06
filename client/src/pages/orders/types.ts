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
  system?: System;
  systemColor?: Color;
  fabric?: Fabric;
  fabricColor?: Color;
}

export type OrderType = "sash" | "product";

export interface OrderWithRelations extends Order {
  dealer?: Dealer;
  dealerBalance?: number;
  sashesCount?: number;
  sashes?: OrderSash[];
  orderType?: OrderType;
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
    totalSashCost: number;
  }>;
}

