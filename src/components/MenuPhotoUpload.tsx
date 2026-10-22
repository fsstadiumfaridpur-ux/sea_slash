import {useEffect,useRef,useState} from 'react';
import {Sparkles,X} from 'lucide-react';
import {makeDishBackgrounds,removeDishBackground} from '../lib/menuPhotoPreparation';
import {uploadMenuPhoto} from '../lib/publicMenu';
type Choice='original'|'cream'|'burgundy';
function Preview({file,label}:{file:File;label:string}){
  const [url,setUrl]=useState('');
  useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return <img src={url} alt={label} className="aspect-[3/2] w-full rounded-md object-contain"/>;
}
export function MenuPhotoUpload({disabled,onUploaded}:{disabled:boolean;onUploaded:(url:string)=>void}){
  const [file,setFile]=useState<File|null>(null);
  const [prepared,setPrepared]=useState<{cream:File;burgundy:File}|null>(null);
  const [selected,setSelected]=useState<Choice>('original');
  const [busy,setBusy]=useState<'ai'|'upload'|null>(null);
  const [error,setError]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(file)dialog.current?.focus();},[file]);
  const close=()=>{if(!busy){setFile(null);setPrepared(null);setError('');}};
  return <>
    <label className={`rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 ${disabled?'opacity-50':'cursor-pointer'}`}>Upload photo
      <input disabled={disabled} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload dish photo" className="sr-only" onChange={event=>{
        const chosen=event.target.files?.[0];event.target.value='';if(!chosen)return;
        if(!['image/jpeg','image/png','image/webp'].includes(chosen.type)||chosen.size>8*1024*1024){setError('Choose JPG, PNG or WebP smaller than 8 MB.');return;}
        setFile(chosen);setSelected('original');setPrepared(null);setError('');
      }}/><span className="mt-1 block text-xs text-slate-500">Preview original, cream or royal burgundy · up to 8 MB</span>
    </label>
    {!file&&error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {file&&<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-4" onClick={event=>event.stopPropagation()}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="menu-photo-title" className="max-h-[90svh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl outline-none dark:bg-slate-950 dark:text-slate-100" onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();close();}
        if(event.key==='Tab'){const elements=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]');if(!elements?.length)return;const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
      }}>
        <div className="flex items-start justify-between gap-4"><div><h2 id="menu-photo-title" className="text-lg font-semibold">Prepare your menu photo</h2><p className="mt-1 text-sm text-slate-500">Preview both backgrounds, then choose one. The full dish fits a 3:2 card.</p></div><button type="button" disabled={!!busy} onClick={close} aria-label="Close photo preparation" className="p-1"><X size={20}/></button></div>
        <p className="text-xs text-slate-500">AI Prepare sends this photo to remove.bg to remove its background. It uses your configured AI service credits. Both colour previews use the same result.</p>
        {error&&<p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Photo background choices">
          {(['original','cream','burgundy'] as const).map(choice=>{const photo=choice==='original'?file:prepared?.[choice];const label=choice==='original'?'Original photo':choice==='cream'?'Clean cream':'Royal burgundy';return <button key={choice} type="button" disabled={!!busy||!photo} aria-pressed={selected===choice} onClick={()=>setSelected(choice)} className={`overflow-hidden rounded-lg border-2 p-2 text-left ${selected===choice?'border-amber-500':'border-slate-200 dark:border-slate-700'} disabled:cursor-default`}>
            {photo?<Preview file={photo} label={label}/>:<div className="grid aspect-[3/2] place-items-center rounded-md px-4 text-center text-xs" style={{background:choice==='cream'?'#f5ecdd':'#491615',color:choice==='cream'?'#684f39':'#f2d4a8'}}>Use AI Prepare to preview your dish here</div>}<span className="mt-2 block text-sm font-medium">{label}{selected===choice?' ✓':''}</span>
          </button>;})}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={!!busy||!!prepared} onClick={async()=>{setBusy('ai');setError('');try{const cutout=await removeDishBackground(file);setPrepared(await makeDishBackgrounds(cutout));setSelected('cream');}catch(cause){setError((cause as Error).message);}finally{setBusy(null);}}} className="flex items-center gap-2 rounded-md border border-amber-500 px-4 py-2 text-sm disabled:opacity-50"><Sparkles size={16}/>{busy==='ai'?'Preparing both previews…':prepared?'AI previews ready':'AI Prepare · both backgrounds'}</button>
          <div className="flex gap-2"><button type="button" disabled={!!busy} onClick={close} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="button" disabled={!!busy} onClick={async()=>{setBusy('upload');setError('');try{const chosen=selected==='original'?file:prepared?.[selected];if(!chosen)throw new Error('Choose an available preview.');const url=await uploadMenuPhoto(chosen);onUploaded(url);setFile(null);setPrepared(null);}catch(cause){setError((cause as Error).message);}finally{setBusy(null);}}} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy==='upload'?'Uploading…':'Use selected photo'}</button></div>
        </div>
        <p className="text-xs text-slate-500">After choosing the photo, click Save Dish to publish your change.</p>
      </div>
    </div>}
  </>;
}
