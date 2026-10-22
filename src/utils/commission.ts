import { roundMoney } from './money';

// Restaurant agreement: deduct 5% of software sales, then apply the landlord rate.
export const COMMISSION_VAT_DEDUCTION = 0.05;
export const commissionBase = (grossSales: number) => grossSales * (1 - COMMISSION_VAT_DEDUCTION);
export const effectiveCommissionRate = (rate: number) => rate * (1 - COMMISSION_VAT_DEDUCTION);
export const calculateCommission = (grossSales: number, rate: number) => roundMoney(commissionBase(grossSales) * rate);
