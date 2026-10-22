import test from 'node:test';
import assert from 'node:assert/strict';
import { menuBoardColumns, menuBoardDensity } from './menuBoard';
import { previewBoardMenu, defaultPublicMenu, validatePublicMenu } from './publicMenu';
test('one-screen menu shows all 46 dishes once and balances them across four columns',()=>{
 const columns=menuBoardColumns(previewBoardMenu.items);
 const dishes=columns.flatMap(column=>column.flatMap(group=>group.items));
 assert.equal(dishes.length,46);assert.equal(new Set(dishes.map(item=>item.id)).size,46);
 assert.deepEqual(dishes.map(item=>item.id),previewBoardMenu.items.map(item=>item.id));
 assert.ok(columns.every(column=>column.length>0));
 const density=menuBoardDensity(columns);
 assert.ok(density.nameSize>=21);
 assert.ok(columns.every(column=>column.reduce((sum,group)=>sum+group.items.length+1.5,0)*density.rowHeight<=780.0001));
});
test('large categories continue in the next column without hiding drafts or missing dishes',()=>{
 const items=Array.from({length:70},(_,i)=>({...previewBoardMenu.items[0],id:`dish-${i}`,name:`Dish ${i}`,sortOrder:i,published:i!==69}));
 const columns=menuBoardColumns(items,5);
 assert.equal(columns.flatMap(column=>column.flatMap(group=>group.items)).length,69);
 assert.ok(columns.flat().some(group=>group.continued));
 assert.equal(menuBoardColumns([]).flat().length,0);
 assert.throws(()=>menuBoardColumns(items,0),/columns/);
});
test('both saved layout choices are accepted while invalid choices are rejected',()=>{
 for(const layout of ['gallery','board'] as const) validatePublicMenu({...defaultPublicMenu,settings:{...defaultPublicMenu.settings,layout}});
 assert.throws(()=>validatePublicMenu({...defaultPublicMenu,settings:{...defaultPublicMenu.settings,layout:'wrong' as any}}),/layout/);
});
