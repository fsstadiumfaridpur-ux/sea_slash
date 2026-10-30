import {MenuItemNumber} from './MenuItemNumber';
import {MenuOffBadge} from './MenuOffBadge';
import {menuSerialNumbers} from '../utils/publicMenu';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, UtensilsCrossed } from 'lucide-react';
import type { PublicMenuData, PublicMenuItem } from '../utils/publicMenu';
import { menuBoardColumns, menuBoardDensity } from '../utils/menuBoard';
import { MenuEmblem } from './MenuEmblem';
import './PublicMenuBoard.css';
function BoardPhoto({item,preview}:{item:PublicMenuItem;preview:boolean}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[item.photoUrl]);
  const crop=item.category.includes('Rice')?'48% 72%':item.category.includes('Bread')?'4% 83%':'95% 75%';
  return <div className="royal-board-photo">{item.photoUrl&&!failed?preview?<div style={{backgroundImage:'url(/menu/royal-feast.png)',backgroundPosition:crop}}/>:<img src={item.photoUrl} alt="" onError={()=>setFailed(true)}/>:<UtensilsCrossed size={20}/>}</div>;
}
export function PublicMenuBoard({menu,preview,loading}:{menu:PublicMenuData;preview:boolean;loading:boolean}) {
  const root=useRef<HTMLElement>(null);
  const [scale,setScale]=useState(1);
  const [notice,setNotice]=useState('');
  const serials=useMemo(()=>menuSerialNumbers(menu.items),[menu.items]);
  const visible=menu.items.filter(item=>item.published);
  const count=visible.length>64?5:4;
  const columns=useMemo(()=>menuBoardColumns(menu.items,count),[menu.items,count]);
  const density=menuBoardDensity(columns);
  useEffect(()=>{
    const resize=()=>{if(root.current)setScale(Math.min(root.current.clientWidth/1920,root.current.clientHeight/1080));};
    resize();const observer=new ResizeObserver(resize);if(root.current)observer.observe(root.current);return()=>observer.disconnect();
  },[]);
  return <main ref={root} className="royal-board-screen" aria-label="Complete restaurant menu">
    <div className="royal-board-canvas" style={{transform:`translate(-50%,-50%) scale(${scale})`}}>
      {preview&&<div className="royal-board-demo">DESIGN PREVIEW · {visible.length} SAMPLE DISHES & PRICES · YOUR REAL MENU REPLACES THESE</div>}
      <header className="royal-board-masthead"><div className="royal-board-brand"><MenuEmblem/><div><strong>Sea Slash</strong><span>INDIAN & KEBAB</span></div></div><div className="royal-board-title"><span>✦ &nbsp; A TASTE OF ROYALTY &nbsp; ✦</span><h1>The Royal Menu</h1></div><div className="royal-board-seal"><span>GRILLS · RICE · CURRIES</span><p>{menu.settings.subtitle}</p></div></header>
      {visible.length?<div className="royal-board-columns" style={{gridTemplateColumns:`repeat(${count},minmax(0,1fr))`}}>
        {columns.map((groups,column)=><div className="royal-board-column" key={column}>{groups.map((group,index)=><section className="royal-board-category" key={`${group.category}-${index}`} aria-label={`${group.category}${group.continued?' continued':''}`}>
          <header style={{height:density.rowHeight*1.5}}><span className="royal-board-category-icon">✦</span><h2 style={{fontSize:Math.min(32,density.nameSize*1.25)}}>{group.category}{group.continued&&<small>continued</small>}</h2><span className="royal-board-rule"/></header>
          {group.items.map(item=><article className={`royal-board-item ${item.available?'':'royal-board-item-sold'}`} key={item.id} style={{height:density.rowHeight}}>
            <div className="royal-board-item-photo" style={{width:density.photoSize,height:density.photoSize,flexShrink:0}}><BoardPhoto item={item} preview={preview}/><MenuOffBadge available={item.available}/></div>
            <div className="royal-board-item-name"><h3 style={{fontSize:item.name.length>38?Math.max(13,density.nameSize*Math.sqrt(38/item.name.length)):density.nameSize}}><MenuItemNumber number={serials.get(item.id)}/>{item.name}</h3></div>
            <strong className="royal-board-item-price" style={{fontSize:density.priceSize}}><small>৳</small>{item.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>
          </article>)}
        </section>)}</div>)}
      </div>:<section className="royal-board-waiting"><MenuEmblem/><h2>{loading?'Setting the royal table…':'Our menu is being prepared.'}</h2><p>A little patience. A royal feast is on its way.</p></section>}
      <footer className="royal-board-bottom"><span>{menu.settings.footer}</span><span>✦ &nbsp; A ROYAL WELCOME. EVERY TIME. &nbsp; ✦</span><span>All prices in Bangladeshi Taka</span></footer>
    </div>
    <div className="royal-board-owner-controls"><button type="button" onClick={async()=>{try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setNotice('Use your browser’s full-screen option.');}catch{setNotice('Use your browser’s full-screen option.');}}}><Maximize2 size={15}/>Full screen</button><a href="#/order">Order online ↗</a><a href="#/admin">Staff login ↗</a></div>
    {notice&&<p role="status" className="royal-board-screen-notice">{notice}</p>}
  </main>;
}
