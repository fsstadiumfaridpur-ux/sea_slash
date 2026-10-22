import {test} from 'node:test';import assert from 'node:assert/strict';
import {hotDealItems,hotDealPages,hotDealSeconds} from './hotDeals';import {previewPublicMenu,validatePublicMenu} from './publicMenu';
test('Hot Deals uses selected dish IDs and the current source photos and prices',()=>{
 const source=structuredClone(previewPublicMenu);const [first,second]=source.items;
 source.settings.hotDealIds=[second.id,first.id];source.items[1].price=999;
 assert.deepEqual(hotDealItems(source).map(item=>item.id),[second.id,first.id]);
 assert.equal(hotDealItems(source)[0].price,999);assert.equal(hotDealItems(source)[0],source.items[1]);
});
test('Hot Deals never leaks hidden, deleted or additional dishes',()=>{
 const source=structuredClone(previewPublicMenu);source.settings.hotDealIds=[source.items[0].id,source.items[1].id];
 source.items[0].published=false;assert.equal(hotDealItems(source).length,1);
 source.items=source.items.filter(item=>item.id!==source.settings.hotDealIds?.[1]);assert.equal(hotDealItems(source).length,0);
 assert.equal(hotDealItems({...source,settings:{...source.settings,hotDealIds:undefined}}).length,0);
});
test('Hot Deals selection accepts more than two and rejects duplicates or unknown IDs',()=>{
 const source=structuredClone(previewPublicMenu);source.settings.hotDealIds=source.items.slice(0,5).map(item=>item.id);source.items.forEach(item=>item.photoUrl='https://example.com/dish.webp');validatePublicMenu(source);
 for(const ids of [[source.items[0].id,source.items[0].id],['missing']])assert.throws(()=>validatePublicMenu({...source,settings:{...source.settings,hotDealIds:ids}}),/Hot Deals/);
});

test('slides always show pairs and include every selected dish, wrapping an odd final item',()=>{
 const menu=structuredClone(previewPublicMenu);menu.settings.hotDealIds=menu.items.slice(0,5).map(item=>item.id);
 const pages=hotDealPages(menu);assert.equal(pages.length,3);assert.ok(pages.every(pair=>pair.length===2));
 assert.deepEqual(pages.map(pair=>pair.map(item=>item.id)),[[menu.items[0].id,menu.items[1].id],[menu.items[2].id,menu.items[3].id],[menu.items[4].id,menu.items[0].id]]);
});
test('Hot Deals timer allows 5–300 whole seconds with a safe default for old settings',()=>{
 assert.equal(hotDealSeconds(),10);assert.equal(hotDealSeconds(5),5);assert.equal(hotDealSeconds(300),300);assert.equal(hotDealSeconds(4),10);
 const menu=structuredClone(previewPublicMenu);menu.items.forEach(item=>item.photoUrl='https://example.com/dish.webp');
 for(const seconds of [4,301,5.5])assert.throws(()=>validatePublicMenu({...menu,settings:{...menu.settings,hotDealSeconds:seconds}}),/timer/);
 for(const seconds of [5,300])validatePublicMenu({...menu,settings:{...menu.settings,hotDealSeconds:seconds}});
});
