import type { TaxRule } from "./tax.types";

/**
 * ⚠ Rates/SAC below are defaults taken from public guidance (Notification 15/2025-CTR et al.)
 *   and are flagged `verified: false`. A chartered accountant must confirm and flip the flag
 *   in Admin → Tax rules before go-live. Every invoice snapshots the rule it used.
 */
export const DEFAULT_TAX_RULES: TaxRule[] = [
  {
    code: "ROOM_ACCOMMODATION", service: "ROOM", description: "Hotel accommodation (room rent)", sac: "996311",
    slabs: [{ upToPaise: 7_500_00, rate: 5 }, { upToPaise: null, rate: 18 }],
    itcAllowed: false, supplyAtProperty: true, verified: false,
    note: "5% (no ITC) up to ₹7,500 per unit per day, 18% above, Notification 15/2025-CTR (effective 22-Sep-2025). Meal plans billed with the room follow the accommodation rate (composite supply).",
  },
  {
    code: "RESTAURANT_FNB", service: "RESTAURANT", description: "Restaurant / food & beverage service", sac: "996331",
    rate: 5, itcAllowed: false, supplyAtProperty: true, verified: false,
    note: "5% without ITC for non-specified premises. If room tariff exceeds ₹7,500 (specified premises) the restaurant is 18% with ITC, change here if applicable.",
  },
  {
    code: "BANQUET_HALL", service: "BANQUET", description: "Banquet hall rental / event venue", sac: "997212",
    rate: 18, itcAllowed: true, supplyAtProperty: true, verified: false,
    note: "Renting of non-residential premises / event venue, 18%. Confirm SAC with CA.",
  },
  {
    code: "BANQUET_CATERING", service: "BANQUET", description: "Banquet catering service", sac: "996334",
    rate: 18, itcAllowed: true, supplyAtProperty: true, verified: false,
    note: "Sources conflict between 5% (no ITC, non-specified premises) and 18%. Defaulted to 18% pending CA confirmation.",
  },
  {
    code: "CONFERENCE_HALL", service: "CONFERENCE", description: "Conference / meeting hall rental", sac: "997212",
    rate: 18, itcAllowed: true, supplyAtProperty: true, verified: false,
  },
  {
    code: "OTHER_SERVICE", service: "OTHER", description: "Other services (transport, extras)", sac: "999799",
    rate: 18, itcAllowed: true, supplyAtProperty: false, verified: false,
  },
];
