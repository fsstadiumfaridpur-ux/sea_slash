import './MenuItemNumber.css';
export function MenuItemNumber({number}:{number:number|undefined}){
  return number===undefined?null:<span className="menu-item-number" aria-label={`Menu item ${number}`}>{number}</span>;
}
