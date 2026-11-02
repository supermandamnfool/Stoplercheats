import * as midiFile from 'midi-file';
import { Track, Tracks } from './track';
import { StepBank } from './generator';
export const DEFAULT_EXPORT_NOTES:Record<Track,number>={[Tracks.KICK]:36,[Tracks.SNARE]:38,[Tracks.HIHAT1]:42,[Tracks.HIHAT2]:46,[Tracks.PERC1]:56,[Tracks.PERC2]:75};
export function exportPatternMidi(bank:StepBank,slot:number,notes:Record<Track,number>=DEFAULT_EXPORT_NOTES):Uint8Array{
  const ppq=480, stepTicks=ppq/4;
  const tracks: midiFile.MidiEvent[][]=[];
  const names:Record<Track,string>={[Tracks.KICK]:'Kick',[Tracks.SNARE]:'Snare',[Tracks.HIHAT1]:'Hat 1',[Tracks.HIHAT2]:'Hat 2',[Tracks.PERC1]:'Perc 1',[Tracks.PERC2]:'Perc 2'};
  for(const id of [Tracks.KICK,Tracks.SNARE,Tracks.HIHAT1,Tracks.HIHAT2,Tracks.PERC1,Tracks.PERC2]){
    const events:{tick:number;order:number;event:midiFile.MidiEvent}[]=[];
    const label=names[id];
    events.push({tick:0,order:0,event:{deltaTime:0,type:'trackName',text:label} as midiFile.MidiEvent});
    bank[id][slot].forEach((hit,index)=>{
      if(!hit)return;
      const tick=index*stepTicks,noteNumber=notes[id];
      events.push({tick,order:2,event:{deltaTime:0,type:'noteOn',channel:9,noteNumber,velocity:100} as midiFile.MidiEvent});
      events.push({tick:tick+Math.floor(stepTicks*0.7),order:1,event:{deltaTime:0,type:'noteOff',channel:9,noteNumber,velocity:0} as midiFile.MidiEvent});
    });
    events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    let last=0;
    const midiTrack=events.map(item=>{const event={...item.event,deltaTime:item.tick-last} as midiFile.MidiEvent;last=item.tick;return event;});
    midiTrack.push({deltaTime:0,type:'endOfTrack'} as midiFile.MidiEvent);
    tracks.push(midiTrack);
  }
  return midiFile.writeMidi({header:{format:1,numTracks:6,ticksPerBeat:ppq},tracks});
}
