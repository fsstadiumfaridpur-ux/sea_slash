import {supabase} from './supabase';
import {validateInvestmentFunding,type InvestmentFunding} from '../utils/investmentFunding';
export interface InvestmentPartnerAccess {user_id:string;email:string;active:boolean}
export async function loadInvestmentFunding(){
 if(!supabase)throw new Error('Sign in to see investment contributions.');
 const {data,error}=await supabase.rpc('get_investment_workspace');if(error)throw new Error(error.code==='PGRST202'?'Run setup/SEA_SLASH_PARTNER_ACCESS.sql in Sea Slash Supabase to enable partner access and contribution tracking.':error.message);
 validateInvestmentFunding(data.funding);return {funding:data.funding as InvestmentFunding,updatedAt:data.updatedAt as string};
}
export async function saveInvestmentFunding(funding:InvestmentFunding,updatedAt:string){
 validateInvestmentFunding(funding);if(!supabase)throw new Error('Administrator login required.');
 const {data,error}=await supabase.rpc('save_investment_funding',{p_funding:funding,p_expected_updated_at:updatedAt});if(error)throw new Error(error.message);return {funding:data.funding as InvestmentFunding,updatedAt:data.updatedAt as string};
}
export async function listInvestmentPartners(){const {data,error}=await supabase!.rpc('list_investment_partners');if(error)throw new Error(error.message);return data as InvestmentPartnerAccess[];}
export async function setInvestmentPartner(email:string,active:boolean){const {error}=await supabase!.rpc('set_investment_partner',{p_email:email.trim().toLowerCase(),p_active:active});if(error)throw new Error(error.message);}
