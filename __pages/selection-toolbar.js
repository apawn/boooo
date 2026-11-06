import {selectedWord} from './dictionary/word.js';

const colors=[['yellow','麦穗黄','#f2d77c'],['green','鼠尾草绿','#b8d5a5'],['blue','晴空蓝','#add3e7'],['pink','蔷薇粉','#edb9c4'],['purple','淡紫','#cdbce6']];
const selector='p,h1,h2,h3,h4,h5,h6,li,td,figcaption';
export function createSelectionToolbar({article,scroller,panel,onDictionary,closeDictionary,onHighlights}) {
  const current=new URL(document.querySelector('.chapter-item[aria-current]').href),book=current.searchParams.get('book'),chapter=current.searchParams.get('chapter');
  const blocks=()=>[...article.querySelectorAll(selector)].filter(b=>!b.closest('nav,button,pre,code')&&!b.querySelector(selector));
  const toolbar=document.createElement('div');toolbar.id='selection-toolbar';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','选中文字工具');
  toolbar.innerHTML='<div class="selection-color-split"><button type="button" class="selection-paint" aria-label="标记重点" title="使用当前颜色标记重点"><span class="selection-color-dot" aria-hidden="true"></span></button><button type="button" class="selection-palette-toggle" aria-label="选择标记颜色" aria-expanded="false"><svg class="selection-palette-icon" viewBox="2 2 20 20" aria-hidden="true"><path fill="#f5ead5" stroke="#a89b80" stroke-width="1.2" d="M12 3a9 9 0 1 0 0 18h1.4a2.2 2.2 0 0 0 1.6-3.7 1.2 1.2 0 0 1 .9-2H18a3 3 0 0 0 3-3C21 7.2 17 3 12 3Z"/><circle cx="6.7" cy="11" r="1.65" fill="#80b994"/><circle cx="9" cy="6.8" r="1.65" fill="#e7ba55"/><circle cx="13.7" cy="6.7" r="1.65" fill="#df8d9d"/><circle cx="17.2" cy="10.1" r="1.65" fill="#85b6d5"/><circle cx="7.8" cy="15.4" r="1.65" fill="#b49bce"/></svg></button></div><button type="button" class="selection-dictionary" aria-label="词典" title="悬停查词"><svg class="selection-dictionary-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="M5 8h4M5 11h4M15 8h4M15 11h4"/></svg></button><div class="selection-palette" hidden></div><span class="selection-feedback" role="status"></span>';
  document.body.append(toolbar);
  const paint=toolbar.querySelector('.selection-paint'),palette=toolbar.querySelector('.selection-palette'),paletteToggle=toolbar.querySelector('.selection-palette-toggle'),dictionary=toolbar.querySelector('.selection-dictionary'),feedback=toolbar.querySelector('.selection-feedback');
  let color='yellow',selected=null,marks=[],dragging=false,timer,hoverTimer,colorHoverTimer,busy=false,ready=false,loadError='',loadedHash=false;
  function publish(){onHighlights?.({marks,ready,busy,error:loadError,jump:jumpHighlight,remove:removeHighlight,refresh:load});}
  function jumpHighlight(mark) {
    hide();closeDictionary();
    if(mark.chapter!==chapter){location.assign('/?'+new URLSearchParams({book,chapter:mark.chapter})+'#highlight='+encodeURIComponent(mark.id));return;}
    const all=blocks(),segment=mark.segments[0];let block=all[segment.block];
    if(block?.textContent!==segment.text){const matches=all.filter(b=>b.textContent===segment.text);block=matches.length===1?matches[0]:null;}
    const range=block&&rangeFor(block,segment.start,segment.end);
    if(!range){loadError='正文已变化，暂时找不到这条标记的位置';publish();return;}
    const rect=range.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();
    scroller.scrollTo({top:scroller.scrollTop+rect.top-bounds.top-scroller.clientHeight*.3,behavior:'instant'});
  }
  async function removeHighlight(mark) {
    if(busy)return;busy=true;loadError='';publish();
    try{marks=await api('remove',mark);draw();}catch(error){loadError=error.message;}finally{busy=false;publish();}
  }
  try{const saved=localStorage.getItem('reader-highlight-color');if(colors.some(c=>c[0]===saved))color=saved;}catch{}
  const setColor=value=>{color=value;paint.style.color=colors.find(c=>c[0]===color)[2];paint.title='标记重点 · '+colors.find(c=>c[0]===color)[1];for(const b of palette.querySelectorAll('[data-color]'))b.setAttribute('aria-pressed',String(b.dataset.color===color));try{localStorage.setItem('reader-highlight-color',color);}catch{}};
  for(const [value,name,hex] of colors) {
    const button=document.createElement('button');button.type='button';button.dataset.color=value;button.style.backgroundColor=hex;button.title=name;button.setAttribute('aria-label',name);button.onclick=()=>{setColor(value);palette.hidden=true;paletteToggle.setAttribute('aria-expanded','false');};palette.append(button);
  }
  const remove=document.createElement('button');remove.type='button';remove.className='selection-remove';remove.textContent='清除标记';remove.onclick=()=>save('remove');palette.append(remove);setColor(color);
  async function api(action,entry) {
    const response=await fetch('/highlights?'+new URLSearchParams({book}),action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,entry})}:{});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'标记保存失败');return data.highlights;
  }
  function rangeFor(block,start,end) {
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT),range=document.createRange();let node,offset=0,started=false;
    while(node=walker.nextNode()) {
      const next=offset+node.length;
      if(!started && start<next){range.setStart(node,start-offset);started=true;}
      if(started && end<=next){range.setEnd(node,end-offset);return range;}
      offset=next;
    }
    return null;
  }
  function draw() {
    if(!CSS.highlights || !window.Highlight)return;
    const all=blocks(),groups=new Map(colors.map(([key])=>[key,[]]));
    for(const mark of marks.filter(m=>m.chapter===chapter))for(const segment of mark.segments) {
      let block=all[segment.block];
      if(block?.textContent!==segment.text) {const matches=all.filter(b=>b.textContent===segment.text);block=matches.length===1?matches[0]:null;}
      if(!block)continue;
      const range=rangeFor(block,segment.start,segment.end);if(range)groups.get(mark.color)?.push(range);
    }
    for(const [name,ranges] of groups)CSS.highlights.set('book-'+name,new Highlight(...ranges));
  }
  async function load() {try{marks=await api();ready=true;loadError='';draw();publish();
    if(!loadedHash){loadedHash=true;const id=new URLSearchParams(location.hash.slice(1)).get('highlight'),mark=marks.find(m=>m.id===id);if(mark)requestAnimationFrame(()=>requestAnimationFrame(()=>jumpHighlight(mark)));}
  }catch(error){ready=false;loadError=error.message;feedback.textContent=error.message;publish();}}
  async function save(action) {
    if(!selected || busy)return;
    if(!CSS.highlights || !window.Highlight){feedback.textContent='当前浏览器不支持文字标记，请使用新版 Edge';return;}
    if(!ready){await load();if(!ready)return;}
    busy=true;publish();paint.disabled=true;remove.disabled=true;feedback.textContent='保存中…';
    const entry={chapter,color,segments:selected.segments};
    try{marks=await api(action,entry);draw();feedback.textContent=action==='remove'?'已清除':'已标记';getSelection()?.removeAllRanges();}
    catch(error){feedback.textContent=error.message;}
    finally{busy=false;paint.disabled=false;remove.disabled=false;publish();}
  }
  function hide(){clearTimeout(colorHoverTimer);toolbar.hidden=true;palette.hidden=true;paletteToggle.setAttribute('aria-expanded','false');clearTimeout(hoverTimer);}
  function capture() {
    const selection=getSelection();if(!selection?.rangeCount || selection.isCollapsed)return null;
    const range=selection.getRangeAt(0);if(!article.contains(range.commonAncestorContainer)||!selection.toString().trim())return null;
    const segments=[];
    blocks().forEach((block,index)=>{
      if(!range.intersectsNode(block))return;
      const clipped=range.cloneRange();
      if(!block.contains(range.startContainer))clipped.setStart(block,0);
      if(!block.contains(range.endContainer))clipped.setEnd(block,block.childNodes.length);
      const before=clipped.cloneRange();before.selectNodeContents(block);before.setEnd(clipped.startContainer,clipped.startOffset);
      const start=before.toString().length,end=start+clipped.toString().length;
      if(end>start)segments.push({block:index,text:block.textContent,start,end});
    });
    const rect=range.getClientRects()[0];if(!segments.length||!rect?.width)return null;
    return {segments,text:selection.toString(),rect,range:range.cloneRange()};
  }
  function check() {
    clearTimeout(timer);if(dragging||panel.contains(document.activeElement)||toolbar.contains(document.activeElement))return;
    timer=setTimeout(()=>{
      const next=capture();
      if(!next){if(!panel.contains(getSelection()?.anchorNode)&&!toolbar.contains(getSelection()?.anchorNode)&&!busy)hide();return;}
      // Extensions may restore the same selection while inspecting hovered text.
      // Only a genuinely new range should dismiss an already open dictionary.
      const previous=selected?.range;
      const unchanged=previous && previous.startContainer===next.range.startContainer && previous.startOffset===next.range.startOffset && previous.endContainer===next.range.endContainer && previous.endOffset===next.range.endOffset && selected.text===next.text;
      selected=next;
      if(unchanged && !toolbar.hidden)return;
      feedback.textContent='';closeDictionary();toolbar.hidden=false;
      const box=toolbar.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();
      const segment=next.segments[0];
      const single=next.segments.length===1 && selectedWord(segment.text,segment.start,segment.end);
      let left=next.rect.left;
      if(single) {
        // Use the whole range: initial-letter styling can split one word into spans.
        const wordBox=next.range.getBoundingClientRect(),buttonBox=dictionary.getBoundingClientRect();
        left=wordBox.left+wordBox.width/2-(buttonBox.left-box.left+buttonBox.width/2);
      }
      toolbar.style.left=Math.max(8,Math.min(left,innerWidth-box.width-8))+'px';
      toolbar.style.top=Math.max(8,Math.max(bounds.top,next.rect.top)-box.height-8)+'px';
    },120);
  }
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());
  paint.onclick=()=>save('paint');
  paletteToggle.onclick=()=>{palette.hidden=!palette.hidden;paletteToggle.setAttribute('aria-expanded',String(!palette.hidden));};
  function lookup(){clearTimeout(timer);clearTimeout(colorHoverTimer);if(selected){clearTimeout(hoverTimer);onDictionary(selected);}}
  dictionary.addEventListener('mouseenter',()=>{clearTimeout(colorHoverTimer);hoverTimer=setTimeout(lookup,180);});
  dictionary.addEventListener('mouseleave',()=>clearTimeout(hoverTimer));
  dictionary.addEventListener('focus',lookup);dictionary.onclick=lookup;
  for(const area of [toolbar.querySelector('.selection-color-split'),palette]) {
    area.addEventListener('mouseenter',()=>{
      clearTimeout(colorHoverTimer);
      colorHoverTimer=setTimeout(()=>{if(!toolbar.hidden)closeDictionary();},300);
    });
    area.addEventListener('mouseleave',()=>clearTimeout(colorHoverTimer));
  }
  panel.addEventListener('mouseenter',()=>clearTimeout(colorHoverTimer));
  document.addEventListener('selectionchange',check);
  document.addEventListener('pointerdown',event=>{
    if(toolbar.contains(event.target)||panel.contains(event.target))return;
    dragging=true;clearTimeout(timer);hide();closeDictionary();
  });
  document.addEventListener('pointerup',event=>{dragging=false;if(!toolbar.contains(event.target)&&!panel.contains(event.target))check();});
  document.addEventListener('pointercancel',()=>{dragging=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  scroller.addEventListener('scroll',hide,{passive:true});window.addEventListener('resize',hide);
  window.addEventListener('bookshelf-synced',load);
  // Reading typography rebuilds inline spans when the initial-letter option changes.
  new MutationObserver(()=>{draw();}).observe(article,{childList:true,subtree:true,characterData:true});
  void load();
}
