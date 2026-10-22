import type { MonthlyExpenseItem, StaffPortalData } from '../types';
import { supabase } from './supabase';
export interface MySalarySheetData extends StaffPortalData { expenses: MonthlyExpenseItem[]; serverNow: string }
export async function getMySalarySheetData(): Promise<MySalarySheetData> {
  if (!supabase) throw new Error('Supabase is not connected.');
  const {data,error} = await supabase.rpc('get_my_salary_sheet_data');
  if (error) throw new Error(error.code === 'PGRST202' ? 'Ask admin to run supabase-staff-salary-sheet.sql to enable your monthly salary sheet.' : error.message);
  return data;
}
