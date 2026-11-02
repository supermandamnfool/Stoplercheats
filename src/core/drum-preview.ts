import { Track, Tracks } from './track';
type AudioCtx = AudioContext;
export class DrumPreview {
  private context: AudioCtx | null = null;
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  async start(): Promise<void> {
    if(!this.context){
      this.context=new AudioContext();
      this.gain=this.context.createGain();this.gain.gain.value=0.5;this.gain.connect(this.context.destination);
      const buffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate);
      const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      this.noise=buffer;
    }
    await this.context.resume();
  }
  volume(value:number):void {if(this.context&&this.gain)this.gain.gain.setTargetAtTime(value,this.context.currentTime,0.01);}
  hit(track:Track,at?:number):void{
    const ctx=this.context,gain=this.gain;if(!ctx||!gain)return;
    const t=Math.max(at??ctx.currentTime,ctx.currentTime);
    const amp=ctx.createGain();amp.connect(gain);
    if(track===Tracks.KICK||track===Tracks.PERC1){
      const osc=ctx.createOscillator();osc.type=track===Tracks.KICK?'sine':'triangle';
      const freq=track===Tracks.KICK?145:240, end=track===Tracks.KICK?46:90;
      osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(end,t+0.13);
      amp.gain.setValueAtTime(0.0001,t);amp.gain.exponentialRampToValueAtTime(0.8,t+0.003);
      amp.gain.exponentialRampToValueAtTime(0.0001,t+(track===Tracks.KICK?0.38:0.2));
      osc.connect(amp);osc.start(t);osc.stop(t+0.42);osc.onended=()=>amp.disconnect();
    }else{
      if(!this.noise)return;
      const src=ctx.createBufferSource();src.buffer=this.noise;
      const filter=ctx.createBiquadFilter();filter.type='highpass';
      filter.frequency.value=track===Tracks.SNARE?1400:track===Tracks.HIHAT1?7500:track===Tracks.HIHAT2?5400:3100;
      const duration=track===Tracks.SNARE?0.18:track===Tracks.HIHAT2?0.32:track===Tracks.PERC2?0.13:0.065;
      amp.gain.setValueAtTime(0.0001,t);amp.gain.exponentialRampToValueAtTime(track===Tracks.SNARE?0.7:0.33,t+0.003);
      amp.gain.exponentialRampToValueAtTime(0.0001,t+duration);
      src.connect(filter);filter.connect(amp);src.start(t);src.stop(t+duration+0.01);
      src.onended=()=>{src.disconnect();filter.disconnect();amp.disconnect();};
    }
  }
  get currentTime():number{return this.context?.currentTime??0;}
  async close():Promise<void>{await this.context?.close();this.context=null;this.gain=null;this.noise=null;}
}
