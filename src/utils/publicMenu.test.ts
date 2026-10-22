import {menuSerialNumbers} from './publicMenu';
import test from 'node:test';import assert from 'node:assert/strict';
import {defaultPublicMenu,menuPages,validatePublicMenu,type PublicMenuItem} from './publicMenu';
const item=(i:number):PublicMenuItem=>({id:`dish-${i}`,name:`Dish ${i}`,description:'A royal dish',category:i<24?'Kebabs':'Biryani',price:280,photoUrl:'',badge:'',available:true,published:true,sortOrder:i});
test('40+ dishes are paged without losing or duplicating items and grouped by category',()=>{
 const dishes=Array.from({length:43},(_,i)=>item(i));const pages=menuPages(dishes);
 assert.equal(pages.length,8);assert.equal(pages.flatMap(page=>page.items).length,43);
 assert.equal(new Set(pages.flatMap(page=>page.items.map(item=>item.id))).size,43);
 assert.ok(pages.every(page=>page.items.length<=6&&page.items.every(item=>item.category===page.category)));
 assert.equal(menuPages(dishes,'Biryani').flatMap(page=>page.items).length,19);
});
test('hidden drafts never appear and search includes names, categories and descriptions',()=>{
 assert.equal(menuPages([{...item(1),published:false}]).length,0);
 assert.equal(menuPages([item(1)],'All','ROYAL')[0].items[0].id,'dish-1');
 assert.equal(menuPages([item(1)],'All','not here').length,0);
 assert.equal(menuPages([{...item(1),available:false}])[0].items[0].available,false);
});
test('menu prices, photo protocols, IDs and screen durations are validated',()=>{
 validatePublicMenu({...defaultPublicMenu,items:[item(1)]});
 for(const photoUrl of ['javascript:alert(1)','data:image/svg+xml,script','http://unsafe/image.png']) assert.throws(()=>validatePublicMenu({...defaultPublicMenu,items:[{...item(1),photoUrl}]}),/HTTPS/);
 for(const price of [-1,Infinity,NaN,1.123]) assert.throws(()=>validatePublicMenu({...defaultPublicMenu,items:[{...item(1),price}]}),/price/);
 assert.throws(()=>validatePublicMenu({...defaultPublicMenu,items:[item(1),item(1)]}),/unique/);
 assert.throws(()=>validatePublicMenu({...defaultPublicMenu,settings:{...defaultPublicMenu.settings,slideSeconds:2}}),/rotation/);
});

test('menu serials start at one, skip hidden dishes and continue across category pages',()=>{
 const items=Array.from({length:43},(_,index)=>item(index));items[0].name='Cheese Masala Dosa';items[0].sortOrder=-1;items[1].published=false;
 const serials=menuSerialNumbers(items);const ordered=menuPages(items).flatMap(page=>page.items);
 assert.equal(serials.get(items[0].id),1);assert.equal(serials.has(items[1].id),false);
 assert.deepEqual(ordered.map(item=>serials.get(item.id)),ordered.map((_,index)=>index+1));
});
