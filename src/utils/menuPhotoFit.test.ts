import {test} from 'node:test';import assert from 'node:assert/strict';import {fitDishPhoto} from './menuPhotoFit';
for(const [width,height] of [[1200,800],[800,1200],[4000,500],[1,1]])test(`centres ${width}×${height} without cropping or distortion`,()=>{
 const fit=fitDishPhoto(width,height);
 assert.ok(fit.x>=0&&fit.y>=0);
 assert.ok(fit.x+fit.width<=1200&&fit.y+fit.height<=800);
 assert.ok(Math.abs(fit.width/fit.height-width/height)<.00001);
 assert.equal(fit.x+fit.width/2,600);assert.equal(fit.y+fit.height/2,400);
});
test('rejects invalid image dimensions',()=>{for(const size of [0,-1,NaN,Infinity])assert.throws(()=>fitDishPhoto(size,800));});
