import { Track, Tracks } from './track';
export type StepBank = Record<Track, number[][]>;
export type Evolution = 'steady' | 'build' | 'reduce' | 'wave';
export const TRACKS: Track[] = [Tracks.KICK, Tracks.SNARE, Tracks.HIHAT1, Tracks.HIHAT2, Tracks.PERC1, Tracks.PERC2];
export const LENGTHS: Record<Track, number> = { [Tracks.KICK]:64,[Tracks.SNARE]:64,[Tracks.HIHAT1]:16,[Tracks.HIHAT2]:16,[Tracks.PERC1]:16,[Tracks.PERC2]:16 };
export function cloneBank(bank: StepBank): StepBank {
  return Object.fromEntries(TRACKS.map(t=>[t,bank[t].map(row=>row.slice())])) as StepBank;
}
const weight=(track:Track, i:number):number=>{
  const beat=i%16, subdivision=beat%4;
  if(track===Tracks.KICK) return beat===0?9:beat===8?7:subdivision===0?5:subdivision===2?3:1;
  if(track===Tracks.SNARE) return beat===4||beat===12?10:subdivision===0?3:subdivision===2?2:0.6;
  if(track===Tracks.HIHAT1) return subdivision===0?7:subdivision===2?6:3;
  if(track===Tracks.HIHAT2) return beat===2||beat===6||beat===10||beat===14?6:subdivision===0?2:1;
  return subdivision===2?5:subdivision===3?4:subdivision===0?2:3;
};
const randomIndex=(scores:number[]):number=>{
  const sum=scores.reduce((a,b)=>a+b,0); if(sum<=0)return -1;
  let target=Math.random()*sum;
  for(let i=0;i<scores.length;i++){target-=scores[i];if(target<=0)return i;}
  return scores.length-1;
};
export function musicalRandom(track:Track, density:number):number[]{
  const length=LENGTHS[track], out=Array(length).fill(0), count=Math.max(0,Math.min(length,Math.round(length*density)));
  for(let k=0;k<count;k++){
    const index=randomIndex(out.map((hit,i)=>hit?0:weight(track,i)));
    if(index<0)break;out[index]=1;
  }
  return out;
}
export function changeDensity(track:Track,source:number[],density:number):number[]{
  const out=source.slice(), target=Math.round(Math.max(0,Math.min(1,density))*out.length);
  while(out.reduce((a,b)=>a+b,0)!==target){
    const add=out.reduce((a,b)=>a+b,0)<target;
    const index=randomIndex(out.map((hit,i)=>add?(hit?0:weight(track,i)):(hit?1/weight(track,i):0)));
    if(index<0)break;out[index]=add?1:0;
  }
  return out;
}
export function mutate(track:Track,source:number[],amount:number):number[]{
  const out=source.slice(), flips=Math.round(out.length*Math.max(0,Math.min(1,amount))*0.4);
  for(let i=0;i<flips;i++){
    const index=randomIndex(out.map((hit,j)=>hit?1/weight(track,j):weight(track,j)));
    if(index>=0)out[index]=out[index]?0:1;
  }
  return out;
}
export function rotate(source:number[],offset:number):number[]{
  const len=source.length, n=((offset%len)+len)%len;
  return [...source.slice(len-n),...source.slice(0,len-n)];
}
export function timeTransform(source:number[],factor:0.5|2):number[]{
  const result=Array(source.length).fill(0);
  source.forEach((hit,i)=>{if(hit)result[factor===2?(i*2)%source.length:Math.floor(i/2)]=1;});
  return result;
}
export function generateVariations(bank:StepBank,sourceSlot:number,destinations:number[],variation:number,evolution:Evolution,locked:Track[]):StepBank{
  const result=cloneBank(bank), total=Math.max(1,destinations.length-1);
  destinations.forEach((slot,index)=>{
    if(slot===sourceSlot)return;
    const progress=index/total;
    const drift=evolution==='build'?progress:evolution==='reduce'?-progress:evolution==='wave'?Math.sin(progress*Math.PI*2)*0.6:0;
    for(const track of TRACKS){
      if(locked.includes(track)){result[track][slot]=bank[track][sourceSlot].slice();continue;}
      const source=bank[track][sourceSlot], density=source.reduce((a,b)=>a+b,0)/source.length;
      const altered=mutate(track,source,variation*(0.35+progress*0.65));
      result[track][slot]=changeDensity(track,altered,Math.max(0,Math.min(1,density+drift*variation*0.45)));
    }
  });
  return result;
}
