import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reorderPublicMenuItems} from './publicMenuOrder';
import type {PublicMenuItem} from './publicMenu';
const items:PublicMenuItem[]=['a','b','c','d'].map((id,sortOrder)=>({id,name:id,sortOrder,category:'Rice',price:10,description:'',photoUrl:'',badge:'',available:true,published:id!=='b'}));
test('moves down and up with consecutive saved positions without mutating the input',()=>{
 const moved=reorderPublicMenuItems(items,'a','c');
 assert.deepEqual(moved.map(x=>x.id),['b','c','a','d']);
 assert.deepEqual(moved.map(x=>x.sortOrder),[0,1,2,3]);
 assert.deepEqual(reorderPublicMenuItems(moved,'d','b').map(x=>x.id),['d','b','c','a']);
 assert.deepEqual(items.map(x=>x.id),['a','b','c','d']);
});
test('retains filtered and hidden dishes and leaves invalid moves untouched',()=>{
 const moved=reorderPublicMenuItems(items,'d','a');
 assert.equal(moved.length,4);
 assert.equal(moved.find(x=>x.id==='b')?.published,false);
 assert.equal(reorderPublicMenuItems(items,'missing','a'),items);
 assert.equal(reorderPublicMenuItems(items,'a','a'),items);
});
