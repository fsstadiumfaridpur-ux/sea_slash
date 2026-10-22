import {useEffect,useState} from 'react';
import {loadWorkSchedule} from './workSchedule';
export function useWorkScheduleHours(){
  const [hours,setHours]=useState(12);
  useEffect(()=>{
    let active=true;
    const reload=()=>{void loadWorkSchedule().then(schedule=>{
      const minutes=(value:string)=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
      const duration=((minutes(schedule.end)-minutes(schedule.start))+1440)%1440;
      if(active&&Number.isFinite(duration)&&duration>0)setHours(duration/60);
    }).catch(()=>{/* Keep the established 11:00–23:00 planning default until setup is available. */});};
    reload();window.addEventListener('restaurant-work-schedule-changed',reload);
    return()=>{active=false;window.removeEventListener('restaurant-work-schedule-changed',reload);};
  },[]);
  return hours;
}
