/** Read the binary response directly: functions.invoke currently decodes image/png as text. */
export async function requestMenuPhoto(endpoint:string,token:string,anonKey:string,file:File,fetcher:typeof fetch=fetch):Promise<Blob>{
  const body=new FormData();body.append('image',file);
  const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:anonKey},body,signal:AbortSignal.timeout(90000)});
  if(!response.ok){
    let message=response.status===401?'Sign in again to prepare a photo.':'AI photo preparation failed. Check the deployed function and REMOVE_BG_API_KEY, or keep the original photo.';
    try{const result=await response.json();if(typeof result.error==='string')message=result.error;}catch{/* Keep the readable fallback. */}
    throw new Error(message);
  }
  const photo=await response.blob();
  const signature=new Uint8Array(await photo.slice(0,8).arrayBuffer());
  if(signature.length!==8||![137,80,78,71,13,10,26,10].every((byte,index)=>signature[index]===byte))throw new Error('The AI service returned an invalid image. Check that prepare-menu-photo contains the provided function code.');
  return photo.type==='image/png'?photo:new Blob([photo],{type:'image/png'});
}
