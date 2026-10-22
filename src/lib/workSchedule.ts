import { supabase } from './supabase';
import { defaultWorkSchedule, validWorkSchedule, type WorkSchedule } from '../utils/staffShiftEarnings';
export async function loadWorkSchedule(): Promise<WorkSchedule> {
  if (!supabase) return defaultWorkSchedule;
  const { data, error } = await supabase.rpc('get_restaurant_work_schedule');
  if (error) throw new Error(error.code === 'PGRST202' ? 'Run supabase-attendance-checkin.sql to enable shift hours and live earnings.' : error.message);
  return data;
}
export async function saveWorkSchedule(schedule: WorkSchedule): Promise<WorkSchedule> {
  if (!validWorkSchedule(schedule)) throw new Error('Choose different valid start and end times.');
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data, error } = await supabase.rpc('save_restaurant_work_schedule', { p_start: schedule.start, p_end: schedule.end });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Run supabase-attendance-checkin.sql before changing shift hours.' : error.message);
  window.dispatchEvent(new Event('restaurant-work-schedule-changed'));
  return data;
}
