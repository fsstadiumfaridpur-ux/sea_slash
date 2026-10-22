import { supabase } from './supabase';
import type { StaffMember, StaffAgreement, StaffPortalData, StaffAttendance, InventoryItem } from '../types';

const accountFunction = import.meta.env.VITE_SUPABASE_STAFF_ACCOUNTS_FUNCTION || 'staff-accounts';

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.code === 'PGRST202' ? 'Staff database setup is required. Run supabase-staff-security.sql in Supabase.' : error.message);
  return data as T;
}

export const listStaff = () => rpc<StaffMember[]>('list_restaurant_staff');
export const saveStaff = async (profile: StaffMember) => {
  const saved=await rpc<StaffMember[]>('save_restaurant_staff', { p_profile: profile });
  const schedule=saved.find(item=>item.id===profile.id)?.hourlyWorkSchedule;
  if(profile.salaryType==='hourly'&&(schedule?.start!==profile.hourlyWorkSchedule?.start||schedule?.end!==profile.hourlyWorkSchedule?.end))throw new Error('Run the latest supabase-hourly-salary.sql in Supabase SQL Editor to save individual working hours. Review the profile and save again afterwards.');
  return saved;
};
export const terminateStaff = (id: string, date: string, reason: string, archive: boolean) =>
  rpc<StaffMember[]>('terminate_restaurant_staff', { p_staff_id: id, p_date: date, p_reason: reason, p_archive: archive });
export const getStaffPortal = () => rpc<StaffPortalData | null>('get_staff_portal');
export interface StaffCheckinStatus { name: string; date: string; status: StaffAttendance['status'] | null; attendance?: StaffAttendance | null; serverNow?: string; checkInOpensAt?: string; checkInClosesAt?: string; nextCheckInOpensAt?: string }
async function checkinRpc(name: string): Promise<StaffCheckinStatus> {
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data, error } = await supabase.rpc(name);
  if (error) throw new Error(error.code === 'PGRST202' ? 'Attendance setup is required. Ask the admin to run supabase-attendance-checkin.sql.' : error.message);
  return data as StaffCheckinStatus;
}
export const getStaffCheckinStatus = () => checkinRpc('get_staff_checkin_status');
export const checkInStaff = () => checkinRpc('check_in_restaurant_staff');
export interface ChefWorkspace {
  profile: Pick<StaffMember, 'id' | 'name' | 'role' | 'phone' | 'joinDate' | 'loginEmail'>;
  attendance: StaffAttendance[];
  inventory: Pick<InventoryItem, 'id' | 'name' | 'banglaName' | 'currentStock' | 'unit' | 'minThreshold'>[];
}
export const getChefWorkspace = () => rpc<ChefWorkspace>('get_chef_workspace');
export const saveChefProfile = (name: string, phone: string) => rpc<ChefWorkspace>('save_chef_profile', { p_name: name, p_phone: phone });
export const checkInChef = () => rpc<ChefWorkspace>('check_in_chef');
export const adjustChefInventory = (id: string, delta: number) => {
  if (!Number.isFinite(delta) || delta >= 0) return Promise.reject(new Error('Chefs can only decrease stock.'));
  return rpc<ChefWorkspace>('adjust_chef_inventory', { p_item_id: id, p_delta: delta });
};
export const publishAgreement = (staffId: string, title: string, document: string) =>
  rpc<StaffAgreement>('issue_staff_agreement', { p_staff_id: staffId, p_title: title, p_document: document });
export const acceptAgreement = (id: string, name: string) => rpc<StaffAgreement>('accept_staff_agreement', { p_id: id, p_name: name });
export const withdrawAgreement = (id: string) => rpc<void>('withdraw_staff_agreement', { p_id: id });

export async function listAgreements(staffId?: string): Promise<StaffAgreement[]> {
  if (!supabase) throw new Error('Supabase is not connected.');
  let query = supabase.from('restaurant_staff_agreements').select('*').order('created_at', { ascending: false });
  if (staffId) query = query.eq('staff_id', staffId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as StaffAgreement[];
}

export async function setStaffLogin(staffId: string, email: string, password: string, reset: boolean) {
  if (!supabase) throw new Error('Supabase is not connected.');
  const { data, error } = await supabase.functions.invoke(accountFunction, { body: { staffId, email, password, action: reset ? 'update_login' : 'create' } });
  if (error) {
    let message = `Staff account service is unavailable. Check the ${accountFunction} Supabase Edge Function.`;
    if ('context' in error && error.context instanceof Response) {
      try { const body = await error.context.json(); message = body.error || message; } catch { /* Keep the deployment error when the gateway returns no JSON. */ }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
}
