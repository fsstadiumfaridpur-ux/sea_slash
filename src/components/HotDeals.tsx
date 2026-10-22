import {MenuItemNumber} from './MenuItemNumber';
import {MenuOffBadge} from './MenuOffBadge';
import {menuSerialNumbers} from '../utils/publicMenu';
import {useEffect,useState} from 'react';
import {UtensilsCrossed} from 'lucide-react';
import type {PublicMenuData,PublicMenuItem} from '../utils/publicMenu';
import {hotDealPages,hotDealSeconds} from '../utils/hotDeals';
import './HotDeals.css';
function DealPhoto({item,preview}:{item:PublicMenuItem;preview:boolean}){
  const [failed,setFailed]=useState(false);
  return <div className="hot-deal-photo">{preview?<div className="hot-deal-sample-photo" role="img" aria-label="Sample platter photo"/>:item.photoUrl&&!failed?<img key={item.photoUrl} src={item.photoUrl} alt={item.name} onError={()=>setFailed(true)}/>:<UtensilsCrossed size={64} aria-hidden="true"/>}</div>;
}
export function HotDeals({menu,loading,preview}:{menu:PublicMenuData;loading:boolean;preview:boolean}){
  const pages=hotDealPages(menu);
  const serials=menuSerialNumbers(menu.items);
  const [page,setPage]=useState(0);
  const seconds=hotDealSeconds(menu.settings.hotDealSeconds);
  const [remaining,setRemaining]=useState(seconds);
  const sequence=pages.map(items=>items.map(item=>item.id).join(',')).join('|');
  const current=pages.length?page%pages.length:0;
  const items=pages[current]??[];
  useEffect(()=>setPage(0),[sequence]);
  useEffect(()=>{
    setRemaining(seconds);if(pages.length<2)return;
    const started=Date.now();
    const tick=window.setInterval(()=>setRemaining(Math.max(0,Math.ceil(seconds-(Date.now()-started)/1000))),250);
    const next=window.setTimeout(()=>setPage(value=>(value+1)%pages.length),seconds*1000);
    return()=>{window.clearInterval(tick);window.clearTimeout(next);};
  },[current,sequence,seconds,pages.length]);
  return <main className={`hot-deals hot-price-${menu.settings.priceStyle??'ribbon'}`} aria-label="Hot Deals" style={{'--hot-columns':items.length||2} as React.CSSProperties}>
    {items.length?<div className="hot-deal-slides" key={`${sequence}-${current}`}>{items.map(item=><article key={`${item.id}-${item.photoUrl}`} className={`hot-deal ${!item.available?'hot-deal-sold':''}`}>
      <div className="hot-deal-visual"><DealPhoto item={item} preview={preview}/><MenuItemNumber number={serials.get(item.id)}/><MenuOffBadge available={item.available}/><span className="hot-deal-label">{preview?'SAMPLE DEAL':'HOT DEAL'}</span><strong className="hot-deal-price"><small>৳</small>{item.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></div>
      <div className="hot-deal-copy"><h1>{item.name}</h1>{item.description&&<p>{item.description}</p>}</div>
    </article>)}</div>:<div className="hot-deals-empty"><UtensilsCrossed size={60}/><h1>{loading?'Preparing hot deals…':'Hot deals coming soon'}</h1></div>}
    {pages.length>1&&<div className="hot-deal-timer" aria-label="Hot Deals slide timer"><span>{String(current+1).padStart(2,'0')} / {String(pages.length).padStart(2,'0')}</span><span>Next in {remaining}s</span><i key={`${sequence}-${current}-${seconds}`} style={{animationDuration:`${seconds}s`}} aria-hidden="true"/></div>}
  </main>;
}
