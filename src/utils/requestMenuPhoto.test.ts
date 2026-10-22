import {test} from 'node:test';import assert from 'node:assert/strict';import {requestMenuPhoto} from './requestMenuPhoto';
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,255,128,195]);
const file=new File(['photo'],'dish.jpg',{type:'image/jpeg'});
test('preserves binary PNG bytes that would be corrupted by response.text()',async()=>{
 const fetcher:typeof fetch=async(_url,options)=>{
  const headers=options?.headers as Record<string,string>;
  assert.equal(headers.Authorization,'Bearer test-token');assert.equal(headers.apikey,'test-anon');
  assert.equal((options?.body as FormData).get('image') instanceof File,true);
  return new Response(bytes,{headers:{'Content-Type':'image/png'}});
 };
 const image=await requestMenuPhoto('https://example.com/function','test-token','test-anon',file,fetcher);
 assert.equal(image.type,'image/png');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);
});
test('normalizes binary MIME types and preserves provider errors',async()=>{
 const binary:typeof fetch=async()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
 assert.equal((await requestMenuPhoto('url','token','anon',file,binary)).type,'image/png');
 const failed:typeof fetch=async()=>Response.json({error:'The AI photo service needs credits.'},{status:502});
 await assert.rejects(requestMenuPhoto('url','token','anon',file,failed),/needs credits/);
 const invalid:typeof fetch=async()=>Response.json({message:'Hello World'});
 await assert.rejects(requestMenuPhoto('url','token','anon',file,invalid),/invalid image/);
});
