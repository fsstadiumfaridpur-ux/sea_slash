import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrations=['vendor-inventory','vendor-history-delete','customer-orders','hard-cash','bkash-admin-transfers','bkash-delete','cash-float-topups','account-security'];
export async function buildFeatureUpdate(){
 let sql=`-- SEA SLASH ONLY: project xrgttljzokzrvqfdbmdu. Update an existing installation.\n-- Preserves accounts, transactions, menu, settings and partner investments.\nbegin;\ndo $guard$ begin\n if to_regclass('public.sea_slash_owner') is null then raise exception 'This update requires an existing Sea Slash installation.';end if;\n if not exists(select 1 from public.sea_slash_owner where email='officialseaslash@gmail.com') then raise exception 'Sea Slash owner verification failed.';end if;\nend $guard$;\n`;
 for(const name of migrations){
  const part=(await readFile(path.join(root,`supabase-${name}.sql`),'utf8')).replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
  sql+=`\n-- ${name}\n${part}\n`;
 }
 return sql+'\ncommit;\n';
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const output=path.join(root,'setup/SEA_SLASH_FEATURE_UPDATE.sql');await writeFile(output,await buildFeatureUpdate());console.log('Created '+output);
}
