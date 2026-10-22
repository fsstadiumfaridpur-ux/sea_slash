import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrations=['schema','admin-security','staff-security','expense-security','investment-security','role-security','balance-security','advance-security','admin-purchase-edit','vendor-inventory','vendor-inventory-create','chef-stock-security','attendance-checkin','hourly-salary','staff-salary-sheet','public-menu','investment-partner'];
export async function buildSetup(email){
 if(!/^[^\s'@]+@[^\s'@]+\.[^\s'@]+$/.test(email))throw new Error('Enter the administrator email created in Sea Slash Supabase Auth.');
 const safe=email.toLowerCase().replaceAll("'","''");
 let sql=`-- SEA SLASH ONLY: project xrgttljzokzrvqfdbmdu. Run once in this new project's SQL Editor.\n-- Requires an Auth user with email ${safe}. All changes are atomic. No existing records are deleted.\nbegin;\nDO $guard$ begin\n if to_regclass('public.app_state') is not null or to_regclass('public.restaurant_staff') is not null then\n  raise exception 'This installer requires a fresh Sea Slash database. Do not run it on Mughal Mahal or an existing installation.';\n end if;\n if not exists(select 1 from auth.users where lower(email)='${safe}') then\n  raise exception 'First create the Sea Slash admin account in Authentication > Users, then run this file again.';\n end if;\nend $guard$;\ncreate table public.sea_slash_owner(id boolean primary key default true check(id),user_id uuid not null unique references auth.users(id),email text not null);\nalter table public.sea_slash_owner enable row level security;\nrevoke all on public.sea_slash_owner from public,anon,authenticated;\ninsert into public.sea_slash_owner(id,user_id,email) select true,id,lower(email) from auth.users where lower(email)='${safe}';\n`;
 for(const name of migrations){
  let part=await readFile(path.join(root,`supabase-${name}.sql`),'utf8');
  part=part.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'')
   .replaceAll("'410baf80-c3ed-4b8c-b312-3e0519a61948'::uuid",'(select user_id from public.sea_slash_owner where id=true)')
   .replaceAll("'officialmughalmahal@gmail.com'",'(select email from public.sea_slash_owner where id=true)');
  sql+=`\n-- ${name}\n${part}\n`;
  if(name==='schema'){
   const settings={stallName:'Sea Slash',foodCourtName:'',stallNumber:'',monthlyRent:0,dailyRent:0,commissionRate:0,managerContact:'',currency:'৳',facebookUrl:''};
   sql+=`insert into public.app_state(key,value) values ('sea_slash_settings_v1','${JSON.stringify(settings)}'::jsonb),('sea_slash_bkash_account_v1','{"opening":{"date":"2026-10-22","amount":0},"transfers":[]}'::jsonb);\n`;
   for(const bucket of ['vendors','vendor_categories','vendor_ledger','sales','expenses','inventory','purchases','wastes','staff','attendance','advances','photos','recipes'])sql+=`insert into public.app_state(key,value) values ('sea_slash_${bucket}_v1','[]'::jsonb);\n`;
  }
 }
 sql+='\ncommit;\n';return sql;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const email=process.argv[2];if(!email)throw new Error('Usage: node scripts/build-setup.mjs admin@example.com');
 const output=path.join(root,'setup/SEA_SLASH_DATABASE.sql');await writeFile(output,await buildSetup(email));console.log('Created '+output);
}
