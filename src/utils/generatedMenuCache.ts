export interface CachedMenuPhoto {photoUrl:string;sourcePhotoUrl:string;custom:boolean;preparation?:'cutout'|'original'}
export function reusableMenuPhoto(photos:Record<string,CachedMenuPhoto>,id:string,source:string):CachedMenuPhoto|undefined {
  const own=photos[id];
  if(own&&(own.custom||own.sourcePhotoUrl===source))return own;
  // One original photo can be used by several dishes without another paid request.
  return source?Object.values(photos).find(photo=>!photo.custom&&photo.sourcePhotoUrl===source):undefined;
}
export function splitMenuBoards<T>(items:readonly T[],capacity=20):T[][] {
  if(!Number.isInteger(capacity)||capacity<1||capacity>20)throw new Error('Choose a board capacity from 1 to 20.');
  const boards:T[][]=[];for(let index=0;index<items.length;index+=capacity)boards.push(items.slice(index,index+capacity));return boards;
}
