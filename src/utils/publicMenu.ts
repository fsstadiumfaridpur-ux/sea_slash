export interface PublicMenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  photoUrl: string;
  badge: string;
  available: boolean;
  published: boolean;
  sortOrder: number;
}
export interface PublicMenuSettings { headline: string; subtitle: string; footer: string; slideSeconds: number; layout?: 'gallery'|'board'; priceStyle?: 'ribbon'|'brush'|'seal'; hotDealIds?: string[]; hotDealSeconds?: number }
export interface PublicMenuData { settings: PublicMenuSettings; items: PublicMenuItem[] }
export const defaultPublicMenu: PublicMenuData = {settings:{headline:'Sea Slash Menu',subtitle:'Welcome to Sea Slash.',footer:"Sea Slash",slideSeconds:15,layout:'gallery',priceStyle:'ribbon'},items:[]};
export const publicMenuCategories = ['Royal Platters','Kebabs & Grills','Rice & Biryani','Indian Curries','Breads & Sides','Drinks & Desserts'];
export function validatePublicMenu(menu: PublicMenuData) {
  if (!menu || !Array.isArray(menu.items) || menu.items.length > 500) throw new Error('A menu can contain up to 500 dishes.');
  if (!menu.settings || !menu.settings.headline.trim() || menu.settings.headline.length > 100 || menu.settings.subtitle.length > 160 || menu.settings.footer.length > 160 || !Number.isInteger(menu.settings.slideSeconds) || menu.settings.slideSeconds < 8 || menu.settings.slideSeconds > 60) throw new Error('Enter valid display text and a rotation time between 8 and 60 seconds.');
  if (menu.settings.priceStyle !== undefined && !['ribbon','brush','seal'].includes(menu.settings.priceStyle)) throw new Error('Choose a valid price label style.');
  if (menu.settings.layout !== undefined && !['gallery','board'].includes(menu.settings.layout)) throw new Error('Choose a valid menu layout.');
  if (menu.settings.hotDealIds !== undefined && (!Array.isArray(menu.settings.hotDealIds) || menu.settings.hotDealIds.length>500 || menu.settings.hotDealIds.some(id=>typeof id!=='string'||!menu.items.some(item=>item.id===id)) || new Set(menu.settings.hotDealIds).size!==menu.settings.hotDealIds.length)) throw new Error('Choose different existing dishes for Hot Deals (up to 500).');
  if(menu.settings.hotDealSeconds!==undefined&&(!Number.isInteger(menu.settings.hotDealSeconds)||menu.settings.hotDealSeconds<5||menu.settings.hotDealSeconds>300))throw new Error('Hot Deals timer must be 5 to 300 seconds.');
  const ids = new Set<string>();
  for (const item of menu.items) {
    if (!item.id || item.id.length > 100 || ids.has(item.id)) throw new Error('Each dish must have a unique ID.'); ids.add(item.id);
    if (!item.name.trim() || item.name.length > 100 || !item.category.trim() || item.category.length > 60 || item.description.length > 300 || item.badge.length > 30) throw new Error('Enter a dish name, category and short description.');
    if (!Number.isFinite(item.price) || item.price < 0 || item.price > 10000000 || Math.round(item.price*100)/100 !== item.price) throw new Error('Enter a valid price with up to two decimal places.');
    if (typeof item.published !== 'boolean' || typeof item.available !== 'boolean' || !Number.isInteger(item.sortOrder) || item.sortOrder < 0 || item.sortOrder > 1000000) throw new Error('Invalid dish visibility or display order.');
    if (item.photoUrl && (!/^https:\/\/[^\s]+$/i.test(item.photoUrl) || item.photoUrl.length > 2000)) throw new Error('Use an HTTPS photo URL or upload a photo.');
  }
}
export function menuPages(items: PublicMenuItem[], category='All', search='', perPage=6) {
  const query=search.trim().toLocaleLowerCase();
  const visible=items.filter(item=>item.published && (category==='All'||item.category===category) && (!query||`${item.name} ${item.description} ${item.category}`.toLocaleLowerCase().includes(query))).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  const categories=[...new Set(visible.map(item=>item.category))];
  return categories.flatMap(name=>{const group=visible.filter(item=>item.category===name);return Array.from({length:Math.ceil(group.length/perPage)},(_,i)=>({category:name,items:group.slice(i*perPage,(i+1)*perPage)}));});
}
/** Public serials follow the complete menu order and stay consistent across pages and layouts. */
export function menuSerialNumbers(items:PublicMenuItem[]):Map<string,number>{
  return new Map(menuPages(items).flatMap(page=>page.items).map((item,index)=>[item.id,index+1]));
}
export const previewPublicMenu: PublicMenuData = {
  ...defaultPublicMenu,
  items: [
    ['Chicken Tikka','Kebabs & Grills','Chargrilled chicken, warm spices & a smoky finish',280,'Signature'],
    ['Chicken Reshmi Kebab','Kebabs & Grills','Tender chicken with a delicate, creamy marinade',300,''],
    ['Chicken Malai Tikka','Kebabs & Grills','Creamy, gently spiced & grilled over the flame',320,'Chef’s pick'],
    ['Chicken Hariyali Kebab','Kebabs & Grills','A fragrant green herb & coriander marinade',280,''],
    ['Chicken Seekh Kebab','Kebabs & Grills','Spiced chicken skewers, grilled until golden',260,''],
    ['Tandoori Chicken','Kebabs & Grills','A classic tandoori marinade & charred edges',350,'Popular'],
    ['Royal Sharing Platter','Royal Platters','A generous spread of grills, rice & bread',1490,'Signature'],
    ['Mughal Chicken Platter','Royal Platters','Grilled chicken with aromatic rice & sides',650,''],
    ['Chicken Biryani','Rice & Biryani','Aromatic rice layered with warmly spiced chicken',280,'Popular'],
    ['Saffron Pulao','Rice & Biryani','Fragrant golden rice with a delicate finish',180,''],
    ['Butter Chicken','Indian Curries','Chicken in a rich, creamy tomato gravy',350,''],
    ['Garlic Naan','Breads & Sides','Warm flatbread finished with garlic & butter',80,''],
  ].map(([name,category,description,price,badge],i)=>({id:`preview-${i}`,name:String(name),category:String(category),description:String(description),price:Number(price),badge:String(badge),photoUrl:'/sea-slash-logo.svg',published:true,available:true,sortOrder:i})),
};

export const previewBoardMenu: PublicMenuData = {
  settings:{...defaultPublicMenu.settings,layout:'board'},
  items:[
    ['Kebabs & Grills',[
      ['Chicken Tikka',280],['Reshmi Kebab',300],['Malai Tikka',320],['Hariyali Kebab',280],['Chicken Seekh Kebab',260],['Beef Seekh Kebab',320],['Tandoori Chicken',350],['Whole Grilled Chicken',650],
    ]],
    ['Royal Platters',[
      ['Royal Sharing Platter',1490],['Mughal Chicken Platter',650],['Mixed Grill Platter',890],['Couple Platter',990],['Family Feast',1890],['Royal Kebab Platter',1190],
    ]],
    ['Rice & Biryani',[
      ['Chicken Biryani',280],['Beef Biryani',350],['Mutton Biryani',450],['Chicken Dum Biryani',320],['Saffron Pulao',180],['Jeera Rice',160],['Steamed Basmati Rice',120],['Vegetable Pulao',180],
    ]],
    ['Indian Curries',[
      ['Butter Chicken',350],['Chicken Tikka Masala',350],['Chicken Korma',320],['Chicken Karahi',330],['Beef Bhuna',380],['Mutton Rogan Josh',480],['Palak Paneer',280],['Dal Makhani',220],['Mixed Vegetable Curry',200],
    ]],
    ['Breads & Sides',[
      ['Butter Naan',60],['Garlic Naan',80],['Cheese Naan',120],['Tandoori Roti',40],['Lachha Paratha',70],['Raita',80],['Fresh Garden Salad',100],['French Fries',120],
    ]],
    ['Drinks & Desserts',[
      ['Mango Lassi',150],['Sweet Lassi',120],['Salted Lassi',120],['Fresh Lime',100],['Masala Tea',60],['Gulab Jamun',100],['Firni',100],
    ]],
  ].flatMap(([category,rows])=>(rows as [string,number][]).map(([name,price])=>({id:`board-${String(category)}-${name}`,name,category:String(category),price,description:'',photoUrl:'/sea-slash-logo.svg',badge:'',available:true,published:true,sortOrder:0}))).map((item,index)=>({...item,sortOrder:index})),
};
