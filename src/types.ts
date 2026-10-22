export interface FoodCourtSettings {
  stallName: string;
  foodCourtName: string;
  stallNumber: string;
  monthlyRent: number; // default 50000
  dailyRent: number;   // default 1667 (50000 / 30)
  commissionRate: number; // default 0.10 (10%)
  managerContact: string;
  currency: string;    // '৳'
  facebookUrl?: string;
}

export interface DailySalesRecord {
  id: string;
  date: string; // YYYY-MM-DD
  grossSales: number;
  cashSales: number;
  bkashSales: number;
  nagadSales: number;
  cardSales: number;
  bankSales?: number; // direct transfers, excluding card/bKash/Nagad already counted
  foodCourtCommission: number; // 10% of gross
  proratedRent: number;        // 1,667
  cogsCost: number;            // raw materials / ingredients
  staffCost: number;           // daily staff wage/salary allocation
  otherExpenses: number;       // gas, ice, extra packaging, cleaning supplies
  netProfit: number;           // gross - commission - rent - cogs - staff - other
  customerCount?: number;
  topSellingItem?: string;
  notes?: string;
}

export type InventoryCategory = string;

export interface InventoryCategoryDefinition {
  id: InventoryCategory;
  name: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  banglaName?: string;
  category: InventoryCategory;
  currentStock: number;
  unit: 'kg' | 'liter' | 'gram' | 'g' | 'ml' | 'packet' | 'pcs' | 'bottle' | 'box' | 'bag' | 'carton' | 'dozen' | 'pair' | 'inch' | 'cm' | 'mm' | 'meter' | 'foot' | 'yard' | 'roll' | 'bundle';
  minThreshold: number;
  unitCost: number; // BDT per unit
  lastUpdated: string;
  photoUrl?: string;
}

export interface PurchaseRecord {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
  supplier: string;
  paymentMode: 'cash' | 'bkash' | 'credit';
  notes?: string;
  photoUrl?: string;
  expenseCategory?: ExpenseCategory;
}

export interface BazaarPhoto {
  id: string;
  title: string;
  category: string;
  date: string;
  imageUrl: string;
  caption: string;
}

export interface WasteRecord {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedLoss: number;
  reason: 'spoilage' | 'burnt_overcooked' | 'end_of_day_unsold' | 'quality_rejection';
}

export type SalaryType = 'monthly' | 'daily' | 'hourly';

export interface StaffMember {
  appRole?: import('./utils/access').RestaurantRole;
  id: string;
  name: string;
  role: string;
  phone: string;
  salaryType: SalaryType;
  baseSalary: number; // BDT per month, day, or hour according to salaryType
  hourlyWorkSchedule?: { start: string; end: string };
  joinDate: string;
  active: boolean;
  loginEmail?: string;
  authUserId?: string;
  terminationDate?: string;
  terminationReason?: string;
  archivedAt?: string;
}

export interface StaffAgreement {
  id: string;
  staff_id: string;
  version: number;
  title: string;
  document: string;
  status: 'issued' | 'accepted' | 'withdrawn';
  created_at: string;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_by: string | null;
}

export interface StaffPortalData {
  profile: StaffMember;
  attendance: StaffAttendance[];
  advances: StaffAdvance[];
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave';

export interface AttendanceRecord {
  checkedInAt?: string;
  shiftStartAt?: string;
  shiftEndAt?: string;
  salaryPerSecond?: number; // Server-snapshotted daily salary / scheduled seconds

  id: string;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  advancePaid: number; // Daily halaat/advance if taken
  overtimeHours: number;
  note?: string;
}

export type StaffAttendance = AttendanceRecord;

export interface StaffAdvance {
  id: string;
  staffId: string;
  date: string;
  amount: number;
  reason: string;
  repaid: boolean;
  paymentMode?: 'cash' | 'bkash' | 'bank' | 'card';
}

export interface RecipeItem {
  id: string;
  dishName: string;
  sellingPrice: number;
  estimatedCOGS: number;
  portionSize: string;
  extraPortionCost?: number;
  costingMode?: 'recipe' | 'direct';
  directCost?: number;
  operatingCosts?: { rent: boolean; lpg: boolean; staff: boolean; commission: boolean };
  ingredients: {
    inventoryItemId: string;
    itemName: string;
    quantity: number;
    unit: string;
  }[];
}

export interface RestaurantPlan {
  operatingDays: number;
  monthlySalesTarget: number;
  monthlyProfitTarget: number;
  averageOrderValue: number;
  foodCostPct: number;
  variableCostPct: number;
  otherFixedCosts: number;
  initialInvestment: number;
}

export interface MenuPricingSettings {
  monthlyPortions: number;
  monthlyLpgCost: number;
  operatingDays: number;
}

export type RestaurantPlans = Record<string, RestaurantPlan>;

export type ExpenseCategory =
  | 'rent'
  | 'commission'
  | 'payroll'
  | 'ingredients'
  | 'gas_utilities'
  | 'packaging'
  | 'ice_beverage'
  | 'maintenance'
  | 'transport'
  | 'other';

export interface MonthlyExpenseItem {
  id: string;
  month: string; // YYYY-MM
  date: string;  // YYYY-MM-DD
  category: ExpenseCategory;
  title: string;
  amount: number;
  paymentMode: 'cash' | 'bkash' | 'bank' | 'card' | 'credit' | 'unknown';
  vendor?: string;
  vendorId?: string;
  vendorBillId?: string;
  vendorBillDate?: string;
  notes?: string;
  isRecurring: boolean;
  source?: 'purchase' | 'advance';
  sourceId?: string;
  staffId?: string;
  salaryMonth?: string;
  statementMonth?: string;
  commissionDate?: string; // sales day settled, separate from actual payment date
  paymentReference?: string;
}
