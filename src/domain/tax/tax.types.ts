/** GST domain types. All money is integer PAISE; rates are percentages. */

export type ServiceType = "ROOM" | "RESTAURANT" | "BANQUET" | "CONFERENCE" | "OTHER";

export interface TaxSlab {
  /** Applies when per-unit-per-day tariff (paise) is <= this value; null = no upper bound */
  upToPaise: number | null;
  rate: number;
}

export interface TaxRule {
  code: string;
  service: ServiceType;
  description: string;
  sac: string; // services use SAC (HSN for services)
  rate?: number; // flat rate
  slabs?: TaxSlab[]; // tariff slabs (accommodation)
  itcAllowed: boolean;
  /** Place of supply is the property (immovable-property related) → always CGST+SGST for a UP hotel */
  supplyAtProperty: boolean;
  verified: boolean;
  note?: string;
}

export interface LineInput {
  description: string;
  ruleCode: string;
  qty: number;
  /** Price per unit excluding tax (paise). For rooms this is the per-night tariff. */
  unitPricePaise: number;
  /** For slab rules: tariff per unit per day used to select the slab. Defaults to unitPricePaise. */
  tariffPaise?: number;
  /** Line-level discount (paise) applied before the invoice-level discount, e.g. a promo on the room only. */
  discountPaise?: number;
}

export interface Line {
  description: string;
  ruleCode: string;
  service: ServiceType;
  sac: string;
  qty: number;
  unitPricePaise: number;
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export type Discount = { type: "percent"; value: number } | { type: "flat"; valuePaise: number } | null;

export interface Totals {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
}

export interface ComputeOptions {
  rules: TaxRule[];
  discount?: Discount;
  /** Customer's state code (from GSTIN), only matters for services not supplied at the property */
  customerStateCode?: string;
  hotelStateCode: string;
}
