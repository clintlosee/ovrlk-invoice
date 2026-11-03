export type CategoryGroup = "schedule_c" | "cogs";

export type CategorySeed = {
  systemKey: string;
  name: string;
  group: CategoryGroup;
};

/** IRS Schedule C defaults, Merchant fees, and a Cost of Goods Sold group. */
export const EXPENSE_CATEGORY_SEEDS: readonly CategorySeed[] = [
  { systemKey: "advertising", name: "Advertising", group: "schedule_c" },
  { systemKey: "car_and_truck", name: "Car and truck", group: "schedule_c" },
  { systemKey: "contract_labor", name: "Contract labor", group: "schedule_c" },
  { systemKey: "depreciation", name: "Depreciation", group: "schedule_c" },
  { systemKey: "insurance", name: "Insurance", group: "schedule_c" },
  {
    systemKey: "legal_and_professional",
    name: "Legal and professional",
    group: "schedule_c",
  },
  { systemKey: "office_expense", name: "Office expense", group: "schedule_c" },
  { systemKey: "rent_or_lease", name: "Rent or lease", group: "schedule_c" },
  { systemKey: "repairs", name: "Repairs", group: "schedule_c" },
  { systemKey: "supplies", name: "Supplies", group: "schedule_c" },
  {
    systemKey: "taxes_and_licenses",
    name: "Taxes and licenses",
    group: "schedule_c",
  },
  { systemKey: "travel", name: "Travel", group: "schedule_c" },
  { systemKey: "meals", name: "Meals", group: "schedule_c" },
  { systemKey: "utilities", name: "Utilities", group: "schedule_c" },
  { systemKey: "other", name: "Other", group: "schedule_c" },
  { systemKey: "merchant_fees", name: "Merchant fees", group: "schedule_c" },
  { systemKey: "cogs_print", name: "Print costs", group: "cogs" },
  { systemKey: "cogs_framing", name: "Framing", group: "cogs" },
  { systemKey: "cogs_materials", name: "Materials", group: "cogs" },
  { systemKey: "cogs_shipping", name: "Shipping of goods", group: "cogs" },
];

export const MERCHANT_FEES_KEY = "merchant_fees";

export function isCategoryGroup(value: string): value is CategoryGroup {
  return value === "schedule_c" || value === "cogs";
}

export function categoryGroupLabel(group: CategoryGroup): string {
  return group === "cogs" ? "Cost of Goods Sold" : "Schedule C";
}
