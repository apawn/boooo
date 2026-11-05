// Follow the Web Audio clock. The synthesizer returns PCM without word timestamps.
export function createReadingLine(scroll) {
  const line=document.createElement('span');
  line.className='reading-line';
  line.setAttribute('aria-hidden','true');
  line.hidden=true;
  document.body.append(line);
  let frame, current, lastIndex=-1, dirty=false;

  function redraw() { dirty=true; }
  scroll.addEventListener('scroll',redraw,{passive:true});
  new ResizeObserver(redraw).observe(scroll.querySelector('article'));
  window.addEventListener('resize',redraw);
  document.fonts?.addEventListener('loadingdone',redraw);

  function locate(index) {
    const {nodes,block}=current;
    const entry=nodes.find(n=>index<n.end);
    if(!entry) return;
    const char=document.createRange();
    char.setStart(entry.node,index-entry.start);
    char.setEnd(entry.node,index-entry.start+1);
    const glyph=char.getClientRects()[0];
    if(!glyph || !glyph.width) return;
    const bounds=scroll.getBoundingClientRect();
    if(index!==lastIndex && (glyph.bottom<=bounds.top || glyph.top>=bounds.bottom)) {
      scroll.scrollTop+=glyph.top-bounds.top-Math.min(48,bounds.height/5);
      dirty=true;
      return;
    }
    const prefix=document.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(char.endContainer,char.endOffset);
    const center=(glyph.top+glyph.bottom)/2;
    let left=glyph.left;
    for(const r of prefix.getClientRects()) {
      if(r.top<=center && r.bottom>=center && r.height<=glyph.height*1.6) left=Math.min(left,r.left);
    }
    const top=glyph.bottom+1;
    left=Math.max(left,bounds.left);
    line.hidden=top<bounds.top || top+3>bounds.bottom || glyph.right<=left;
    line.style.transform='translate('+left+'px,'+top+'px)';
    line.style.width=(Math.min(glyph.right,bounds.right)-left)+'px';
    lastIndex=index;
  }
  function draw() {
    const {clock,start,duration,marks,energy,base}=current;
    const fraction=Math.max(0,Math.min(1,(clock.currentTime-start)/duration));
    const pos=fraction*(energy.length-1);
    const bin=Math.floor(pos);
    const progress=energy[bin]+(pos-bin)*((energy[bin+1]??energy[bin])-energy[bin]);
    let lo=0,hi=marks.length-1;
    while(lo<hi) {
      const mid=(lo+hi)>>1;
      if(marks[mid].end<progress) lo=mid+1;else hi=mid;
    }
    const index=base+marks[lo].index;
    if(index!==lastIndex || dirty) {dirty=false;locate(index);}
    frame=requestAnimationFrame(draw);
  }
  function clear() {
    cancelAnimationFrame(frame);
    current=null;lastIndex=-1;line.hidden=true;
  }
  function follow(part,buffer,clock,start) {
    clear();
    const nodes=[];
    const walker=document.createTreeWalker(part.block,NodeFilter.SHOW_TEXT);
    let offset=0;
    while(walker.nextNode()) {
      const node=walker.currentNode;
      nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;
    }
    // Use grapheme ends so inline markup, combining accents and surrogate pairs
    // keep their original DOM offsets. Punctuation accounts for phrase pauses.
    let weight=0;
    const marks=[];
    for(const {segment,index} of new Intl.Segmenter(part.lang,{granularity:'grapheme'}).segment(part.text)) {
      if(/^\s+$/u.test(segment)) continue;
      weight+=/[\p{L}\p{N}]/u.test(segment)?1:0.55;
      marks.push({index:index+segment.length-1,end:weight});
    }
    if(!marks.length) return;
    for(const mark of marks) mark.end/=weight;
    const samples=buffer.getChannelData(0);
    const stride=Math.max(1,Math.round(buffer.sampleRate*.025));
    const energy=[0];
    for(let i=0;i<samples.length;i+=stride) {
      let peak=0;
      for(let j=i;j<Math.min(i+stride,samples.length);j+=4) peak=Math.max(peak,Math.abs(samples[j]));
      energy.push(energy.at(-1)+Math.min(1,peak/.035));
    }
    const total=energy.at(-1);
    for(let i=0;i<energy.length;i++) energy[i]=total?energy[i]/total:i/(energy.length-1);
    current={nodes,block:part.block,base:part.offset,marks,energy,clock,start,duration:buffer.duration};
    draw();
  }
  return {follow,clear};
}
