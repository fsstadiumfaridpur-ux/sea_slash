import type {MonthlyExpenseItem} from '../types';
import {roundMoney} from './money';

const otherCategories=new Set(['gas_utilities','packaging','ice_beverage','maintenance','transport','other']);

export function dailySalesCosts(expenses:MonthlyExpenseItem[],date:string) {
  const seen=new Set<string>();
  const rows=expenses.filter(expense=>{
    if(expense.date!==date || seen.has(expense.id) || !Number.isFinite(expense.amount) || expense.amount<0) return false;
    seen.add(expense.id);
    return expense.category==='ingredients' || otherCategories.has(expense.category);
  });
  return {ingredients:roundMoney(rows.filter(row=>row.category==='ingredients').reduce((sum,row)=>sum+row.amount,0)),
    other:roundMoney(rows.filter(row=>otherCategories.has(row.category)).reduce((sum,row)=>sum+row.amount,0)),rows};
}
