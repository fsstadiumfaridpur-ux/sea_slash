import {MenuItemNumber} from './MenuItemNumber';
import {MenuOffBadge} from './MenuOffBadge';
import {HotDeals} from './HotDeals';
import { MenuEmblem } from './MenuEmblem';
import { PublicMenuBoard } from './PublicMenuBoard';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, Pause, Play, UtensilsCrossed } from 'lucide-react';
import { getPublicMenu } from '../lib/publicMenu';
import { defaultPublicMenu, menuPages, menuSerialNumbers, previewPublicMenu, previewBoardMenu, type PublicMenuItem } from '../utils/publicMenu';
import './PublicMenu.css';

function DishPhoto({item, preview}:{item:PublicMenuItem;preview:boolean}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[item.photoUrl]);
  const position=item.name.includes('Rice')||item.name.includes('Biryani')||item.name.includes('Pulao')?'48% 72%':item.name.includes('Naan')?'4% 83%':item.name.includes('Hariyali')?'78% 90%':'95% 75%';
  return <div className="royal-dish-photo">
    {item.photoUrl && !failed ? preview ? <div className="royal-preview-photo" style={{backgroundImage:'url(/menu/royal-feast.png)',backgroundPosition:position}} /> : <img src={item.photoUrl} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)} /> : <UtensilsCrossed aria-hidden="true" size={30} />}
  </div>;
}
export function PublicMenu() {
  const params=new URLSearchParams(window.location.hash.split('?')[1]??'');
  const preview=params.get('preview')==='1';
  const hotDeals=window.location.hash.split('?')[0]==='#/hot-deals';
  const forcedLayout=window.location.hash.split('?')[0]==='#/menu-board'?'board':params.get('layout');
  const [menu,setMenu]=useState(preview?(forcedLayout==='board'?previewBoardMenu:previewPublicMenu):defaultPublicMenu);
  const board=forcedLayout==='board'||(forcedLayout!=='gallery'&&menu.settings.layout==='board');
  const [loading,setLoading]=useState(!preview);
  const [category,setCategory]=useState('All');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [tvMode,setTvMode]=useState(params.get('tv')==='1');
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    if(preview)return;
    let cancelled=false; let refreshing=false;
    const refresh=async()=>{if(refreshing)return;refreshing=true;try{const next=await getPublicMenu();if(!cancelled)setMenu(next);}catch{/* Keep the last successful menu visible during a connection interruption. */}finally{refreshing=false;if(!cancelled)setLoading(false);}};
    void refresh(); const timer=window.setInterval(refresh,60000);
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[preview]);
  useEffect(()=>{document.title=hotDeals?'Sea Slash · Hot Deals':board?'Sea Slash · Complete Menu Board':'Sea Slash · The Royal Menu';},[board,hotDeals]);
  const categories=useMemo(()=>['All',...new Set(menu.items.filter(item=>item.published).sort((a,b)=>a.sortOrder-b.sortOrder).map(item=>item.category))],[menu]);
  useEffect(()=>{if(category!=='All'&&!categories.includes(category)){setCategory('All');setPage(0);}},[categories,category]);
  const pages=useMemo(()=>menuPages(menu.items,category,query),[menu,category,query]);
  const currentIndex=pages.length?page%pages.length:0;
  const current=pages[currentIndex];
  const serials=useMemo(()=>menuSerialNumbers(menu.items),[menu.items]);
  useEffect(()=>{if(hotDeals||board||!playing||pages.length<2||query)return;const timer=window.setInterval(()=>setPage(value=>(value+1)%pages.length),menu.settings.slideSeconds*1000);return()=>window.clearInterval(timer);},[hotDeals,board,playing,pages.length,query,menu.settings.slideSeconds,category]);
  useEffect(()=>{const change=()=>{if(!document.fullscreenElement)setTvMode(false);};document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
  const go=(delta:number)=>{setPlaying(false);setPage(value=>pages.length?(value+delta+pages.length)%pages.length:0);};
  async function fullScreen(){setNotice('');try{if(tvMode){setTvMode(false);if(document.fullscreenElement)await document.exitFullscreen();}else{setTvMode(true);setQuery('');setCategory('All');setPage(0);setPlaying(true);if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}}catch{setNotice('Screen mode is on. Use your browser’s full-screen option for an edge-to-edge display.');}}
  if(hotDeals)return <HotDeals menu={preview?{...menu,settings:{...menu.settings,hotDealIds:menu.items.filter(item=>item.published).slice(0,5).map(item=>item.id)}}:menu} loading={loading} preview={preview}/>;
  if(board)return <PublicMenuBoard menu={menu} preview={preview} loading={loading}/>;
  return <main className={`royal-menu royal-gallery royal-price-${menu.settings.priceStyle??'ribbon'} ${tvMode?'royal-tv':''}`} onKeyDown={event=>{if((event.target as HTMLElement).tagName==='INPUT')return;if(event.key==='ArrowRight')go(1);if(event.key==='ArrowLeft')go(-1);}}>
    {preview&&<div className="royal-preview-note">DESIGN PREVIEW <span>Sample dishes, photos & prices · Your published menu will replace these.</span><a href="#/admin">Manage your menu ↗</a></div>}
    <header className="royal-header">
      <a href="#/menu" className="royal-brand" aria-label="Sea Slash menu"><MenuEmblem/><span><strong>Sea Slash</strong><small>INDIAN & KEBAB</small></span></a>
      <div className="royal-header-title"><span className="royal-ornament">✦</span><span>A TASTE OF ROYALTY</span><span className="royal-ornament">✦</span></div>
        <div className="royal-menu-controls"><div className="royal-pagination"><button type="button" aria-label="Previous menu page" disabled={pages.length<2} onClick={()=>go(-1)}><ArrowLeft size={13}/></button><button type="button" aria-label={playing?'Pause menu rotation':'Play menu rotation'} aria-pressed={playing} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={12}/>:<Play size={12}/>}</button><button type="button" aria-label="Next menu page" disabled={pages.length<2} onClick={()=>go(1)}><ArrowRight size={13}/></button></div></div>
      {!tvMode&&!preview&&<a href="#/order" style={{background:'#8f2436',color:'#fff0cc',padding:'9px 14px',borderRadius:8,fontSize:14,fontWeight:700,whiteSpace:'nowrap'}}>Order online ↗</a>}
      <button type="button" className="royal-screen-button" onClick={fullScreen}>{tvMode?<Minimize2 size={17}/>:<Maximize2 size={17}/>}<span>{tvMode?'Exit screen mode':'Full screen'}</span></button>
    </header>
    {notice&&<p role="status" className="royal-notice">{notice}</p>}
    <div className="royal-showcase">
      <section className="royal-menu-board" aria-label="Dishes and prices">
        {current?<div className="royal-dishes" style={{'--gallery-columns':Math.min(3,current.items.length),'--gallery-rows':Math.ceil(current.items.length/3)} as React.CSSProperties} key={`${category}-${currentIndex}`}>
          {current.items.map(item=><article key={item.id} className={`royal-dish ${!item.available?'royal-sold-out':''}`}>
            <div className="royal-dish-visual"><DishPhoto item={item} preview={preview}/><MenuItemNumber number={serials.get(item.id)}/><MenuOffBadge available={item.available}/>
            <div className="royal-dish-content">{item.badge&&<span className="royal-dish-badge">{item.badge}</span>}<p>{item.description}</p><div className="royal-dish-bottom"><strong><small>৳</small>{item.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></div></div></div><h3 className="royal-dish-title">{item.name}</h3>
          </article>)}
        </div>:<div className="royal-menu-empty"><MenuEmblem/><h3>{loading?'Setting the royal table…':query?'No dishes found.':'Our menu is being prepared.'}</h3><p>{query?'Try another dish or category.':'A little patience. A royal feast is on its way.'}</p>{!loading&&!query&&<a href="#/menu?preview=1">View the menu design ↗</a>}</div>}

      </section>
    </div>
    <footer className="royal-footer"><span>{menu.settings.footer}</span><div>{pages.length>1&&<span className="royal-live-dot">{playing?'Menu rotates automatically':'Browse at your own pace'}</span>}{!tvMode&&<a href="#/admin">Staff login ↗</a>}</div></footer>
  </main>;
}
