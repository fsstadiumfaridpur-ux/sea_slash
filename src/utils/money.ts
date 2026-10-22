export const roundMoney = (amount: number): number => Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100) / 100;
