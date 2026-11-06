import {createReadingLine} from './reading-line.js';
import {englishWordStart,sameLanguageBlocks} from './reading-text.js';
import {normalizeWord} from './dictionary/word.js';
(() => {
  const article = document.querySelector('article');
  const scroll = document.querySelector('#scroll');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'speech-trigger';
  trigger.title = trigger.ariaLabel = '从这里开始朗读';
  trigger.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  const player = document.createElement('div');
  player.className = 'speech-statusbar';
  player.innerHTML = '<button type="button" class="reading-location" title="跳转到当前朗读位置并恢复跟随">回到朗读位置</button><button type="button" class="pause">暂停</button><button type="button" class="stop" aria-label="停止朗读">停止</button><span role="status" aria-live="polite"></span>';
  const status = player.querySelector('[role=status]');
  const pause = player.querySelector('.pause');
  const stop = player.querySelector('.stop');
  const readingLocation=player.querySelector('.reading-location');
  document.body.append(trigger);
  scroll.before(player);
  trigger.hidden = pause.hidden = stop.hidden = readingLocation.hidden = true;
  status.textContent='悬停文字或点击段落左侧的 ▶ 开始朗读';
  const readingLine=createReadingLine(scroll);
  readingLocation.onclick=()=>readingLine.jumpToCurrent();
  const toolbarPause=document.createElement('button');
  toolbarPause.id='toolbar-pause';
  toolbarPause.type='button';
  toolbarPause.hidden=true;
  document.querySelector('.reader-tools').prepend(toolbarPause);
  toolbarPause.onclick=()=>pause.click();
  let activeParagraph;
  function markParagraph(block) {
    const wrapper=block?.closest('.speech-paragraph');
    if(wrapper===activeParagraph) return;
    if(activeParagraph) {
      activeParagraph.classList.remove('is-reading');
      activeParagraph.querySelector('.paragraph-pause').hidden=true;
    }
    activeParagraph=wrapper;
    if(wrapper) {
      wrapper.classList.add('is-reading');
      wrapper.querySelector('.paragraph-pause').hidden=false;
      showPause(session?.paused ?? false);
    }
  }
  function showPause(paused) {
    pause.textContent=paused?'继续':'暂停';
    toolbarPause.textContent=paused?'▶':'Ⅱ';
    toolbarPause.title=toolbarPause.ariaLabel=paused?'继续朗读':'暂停朗读';
    const button=activeParagraph?.querySelector('.paragraph-pause');
    if(button) {
      button.title=button.ariaLabel=paused?'继续本段朗读':'暂停本段朗读';
      button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24">'+(paused?'<path d="m9 5 11 7-11 7Z"/>':'<path d="M7 5h4v14H7zM15 5h4v14h-4z"/>')+'</svg>';
    }
  }
  let selected, session, context;
  document.addEventListener('dictionary-pronounce',()=>{
    if(session && !session.paused) pause.click();
  });
  function updateStatus(s) {
    player.dataset.state=s.loading?'loading':s.paused?'paused':'playing';
    status.textContent=s.paused
      ? (s.loading?'已暂停 · 正在准备播放…':'已暂停')
      : s.loading?'正在准备播放…':s.lang==='zh'?'正在朗读 · 普通话':'正在朗读 · 英文';
  }

  const dialog=document.querySelector('#voice-dialog');
  const voiceSelect=document.querySelector('#mandarin-voice');
  const preview=document.querySelector('#voice-preview');
  let voice=voiceSelect.value;
  try {
    const saved=localStorage.getItem('mandarinVoice');
    if([...voiceSelect.options].some(o=>o.value===saved)) voice=saved;
    else localStorage.setItem('mandarinVoice',voice);
  } catch {}
  function loadPreview() {
    preview.pause();
    const option=voiceSelect.selectedOptions[0];
    document.querySelector('#voice-description').textContent=option.dataset.description;
    document.querySelector('#voice-preview-text').textContent=option.dataset.previewText;
    preview.src='/voice-preview/'+voiceSelect.value+'.wav';
  }
  document.querySelector('#voice-settings').onclick=()=>{
    if(session && !session.paused) pause.click();
    voiceSelect.value=voice;
    dialog.returnValue='';
    loadPreview();
    dialog.showModal();
  };
  voiceSelect.onchange=()=>{
    loadPreview();
    preview.play().catch(()=>{}); // Native controls also allow an explicit replay.
  };
  dialog.querySelector('form').addEventListener('submit',event=>{
    if(event.submitter?.value==='apply') {
      if(voice!==voiceSelect.value && session) finish('音色已切换，请从需要的位置开始朗读');
      voice=voiceSelect.value;
      try {localStorage.setItem('mandarinVoice',voice);} catch {}
    }
  });
  dialog.onclose=()=>preview.pause();
  let hoverRect, hideTimer;
  function hideTrigger() {
    clearTimeout(hideTimer);
    trigger.hidden=true;selected=null;hoverRect=null;
  }
  function positionTrigger(range,rect) {
    selected=range.cloneRange();hoverRect=rect;
    trigger.hidden=false;
    const {width,height}=trigger.getBoundingClientRect();
    const bounds=scroll.getBoundingClientRect();
    trigger.style.left=Math.max(bounds.left,Math.min(bounds.right-width,rect.left+(rect.width-width)/2))+'px';
    trigger.style.top=Math.max(bounds.top,rect.top-height+5)+'px';
  }
  function showSelection() {
    const sel = getSelection();
    if(normalizeWord(sel.toString())) { hideTrigger(); return; }
    if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) return;
    selected = null;
    trigger.hidden = true;
    const range = sel.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer) || range.startContainer.parentElement?.closest('.paging')) return;
    const bounds = scroll.getBoundingClientRect();
    const rect = [...range.getClientRects()].find(r=>r.width && r.height && r.bottom>bounds.top && r.top<bounds.bottom);
    if (!rect) return;
    positionTrigger(range,rect);
  }
  document.addEventListener('selectionchange',showSelection);
  scroll.addEventListener('scroll',hideTrigger,{passive:true});
  window.addEventListener('resize',hideTrigger);
  trigger.addEventListener('pointerdown',e=>e.preventDefault());
  const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch' || event.buttons) return;
    clearTimeout(hideTimer);
    if(!trigger.hidden && hoverRect) {
      const buttonRect=trigger.getBoundingClientRect();
      // Keep the target stable while the pointer travels up to its button.
      if(event.clientX>=buttonRect.left-3 && event.clientX<=buttonRect.right+3 &&
         event.clientY>=buttonRect.top && event.clientY<=hoverRect.top) return;
      if(trigger.contains(event.target)) return;
    }
    if(!getSelection().isCollapsed) return;
    const block=event.target.closest('p,h1,h2,h3,h4,h5,h6,li,figcaption');
    if(block && article.contains(block) && !event.target.closest('nav,button,a,pre,code')) {
      const caret=document.caretPositionFromPoint?.(event.clientX,event.clientY);
      const range=caret?null:document.caretRangeFromPoint?.(event.clientX,event.clientY);
      const node=caret?.offsetNode ?? range?.startContainer;
      const offset=caret?.offset ?? range?.startOffset;
      if(node?.nodeType===Node.TEXT_NODE && block.contains(node)) {
        for(const part of graphemes.segment(node.data)) {
          if(part.index>offset) break;
          if(part.index+part.segment.length<offset || !/[\p{L}\p{N}]/u.test(part.segment)) continue;
          const glyph=document.createRange();
          glyph.setStart(node,part.index);glyph.setEnd(node,part.index+part.segment.length);
          const rect=glyph.getBoundingClientRect();
          if(event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom) {
            positionTrigger(glyph,rect);return;
          }
        }
      }
    }
    hideTimer=setTimeout(hideTrigger,160);
  },{passive:true});
  document.addEventListener('pointerleave',hideTrigger);

  // Keep controls outside paragraph text so selection and reading-line offsets stay intact.
  article.classList.add('has-paragraph-speech');
  for(const paragraph of article.querySelectorAll('p')) {
    if(paragraph.closest('nav,header') || !/[\p{L}\p{N}]/u.test(paragraph.textContent)) continue;
    const wrapper=document.createElement('div');
    wrapper.className='speech-paragraph';
    const button=document.createElement('button');
    button.type='button';
    button.className='paragraph-play';
    button.title=button.ariaLabel='从本段开始朗读';
    button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 11 7-11 7Z"/></svg>';
    const paragraphPause=document.createElement('button');
    paragraphPause.type='button';
    paragraphPause.className='paragraph-pause';
    paragraphPause.hidden=true;
    paragraphPause.addEventListener('click',()=>pause.click());
    paragraph.before(wrapper);
    wrapper.append(button,paragraphPause,paragraph);
    button.addEventListener('click',()=>{
      const range=document.createRange();
      range.selectNodeContents(paragraph);
      startReading(range);
    });
  }

  // Read from the selected character, or the start of its English word.
  function* passage(range) {
    let first=true;
    const blocks=[...article.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption')].filter(block=>
      !block.closest('nav') && !block.querySelector('p,li,figcaption') && range.comparePoint(block,block.childNodes.length)>=0);
    for(const {block,lang} of sameLanguageBlocks(blocks)) {
      const fragment=document.createRange();
      fragment.selectNodeContents(block);
      if(block.contains(range.startContainer)) fragment.setStart(range.startContainer,range.startOffset);
      const paragraphText=block.textContent;
      const start=englishWordStart(paragraphText,paragraphText.length-fragment.toString().length);
      const suffix=paragraphText.slice(start);
      const full=suffix.trim();
      const base=start+suffix.indexOf(full);
      if(!full) continue;
      const sentences=new Intl.Segmenter(lang,{granularity:'sentence'}).segment(full);
      for(const {segment,index} of sentences) {
        let rest=segment.trim();
        let offset=base+index+segment.indexOf(rest);
        while(rest) {
          // Preserve Mandarin sentence context, including the first comma.
          const limit=lang==='zh'?95:(first?95:235);
          let end=rest.length;
          if(end>limit) {
            const prefix=rest.slice(0,limit);
            const clause=[...prefix.matchAll(/[，；：,;:—](?!\d)/g)].at(-1);
            const phrase=first && lang==='en' && [...prefix.matchAll(/\s+(?:that|which|while|because|although|where|when|but|and|from)\s/gi)].filter(m=>m.index>=30).at(-1);
            const word=prefix.lastIndexOf(' ');
            if(clause) end=clause.index+1;
            else if(phrase) end=phrase.index;
            else end=word>limit/3 ? word+1 : limit;
          }
          const text=rest.slice(0,end).trim();
          const remainder=rest.slice(end);
          rest=remainder.trim();
          const partOffset=offset;
          offset+=end+remainder.indexOf(rest);
          if(/[\p{L}\p{N}]/u.test(text)) {
            first=false;
            yield {text,lang,block,offset:partOffset};
          }
        }
      }
    }
  }
  function finish(message='已停止') {
    readingLine.freeze();
    if(session) {
      session.controller.abort();
      if(session.source) { session.source.onended=null; session.source.stop(); session.source.disconnect(); }
    }
    session=undefined;
    markParagraph(null);toolbarPause.hidden=true;
    pause.hidden=stop.hidden=readingLocation.hidden=true;
    player.dataset.state='idle';status.textContent=message;
  }
  async function load(part,s) {
    const result=await fetch('/speech',{method:'POST',signal:s.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text:part.text,lang:part.lang,voice:part.lang==='zh'?voice:undefined})});
    if(!result.ok) throw new Error('Synthesis failed');
    return context.decodeAudioData(await result.arrayBuffer());
  }
  function error(s) {
    if(s!==session) return;
    finish('朗读失败，请点击播放按钮重试。');
  }
  // Prepare one sentence ahead while the current sentence plays.
  async function play(part,buffer,s) {
    if(session!==s) return;
    const source=context.createBufferSource();
    source.buffer=buffer;source.connect(context.destination);s.source=source;
    s.loading=false;s.lang=part.lang;updateStatus(s);
    readingLocation.disabled=false;
    const next=s.parts.next();
    const preparedVoice=voice;
    const prepared=next.done?null:(async()=>{
      // A quick stop or a new selection should not queue a long unused synthesis.
      await new Promise(resolve=>setTimeout(resolve,650));
      s.controller.signal.throwIfAborted();
      return load(next.value,s);
    })();
    prepared?.catch(()=>{}); // Handled when this chunk is consumed or the session stops.
    source.onended=async()=>{
      source.disconnect();s.source=null;
      if(session!==s) return;
      readingLine.freeze();
      if(next.done) return finish('本章朗读完成');
      s.loading=true;updateStatus(s);
      try {
        let buffer=await prepared;
        if(session===s && next.value.lang==='zh' && preparedVoice!==voice) buffer=await load(next.value,s);
        await play(next.value,buffer,s);
      } catch { error(s); }
    };
    const start=context.currentTime;
    markParagraph(part.block);
    source.start(start);
    readingLine.follow(part,buffer,context,start);
    if(s.paused) readingLine.freeze();
  }
  async function startReading(range) {
    const parts=passage(range);
    const first=parts.next();
    if(first.done) return;
    finish();
    readingLine.clear();
    const s={parts,controller:new AbortController(),paused:false,loading:true,lang:first.value.lang};
    session=s;
    markParagraph(first.value.block);
    getSelection().removeAllRanges();hideTrigger();
    pause.hidden=stop.hidden=readingLocation.hidden=false;readingLocation.disabled=true;
    toolbarPause.hidden=false;showPause(false);updateStatus(s);
    try {
      context ??= new AudioContext();
      await context.resume();
      await play(first.value,await load(first.value,s),s);
    } catch {error(s);}
  }
  trigger.addEventListener('click',()=>{
    if(selected) startReading(selected.cloneRange());
  });
  pause.onclick=async()=>{
    const s=session;
    if(!s || !context) return;
    s.paused=!s.paused;
    showPause(s.paused);
    updateStatus(s);
    try {
      if(s.paused) {
        await context.suspend();
        if(session===s && s.paused) readingLine.freeze();
      } else {
        await context.resume();
        if(session===s && !s.paused) readingLine.resume();
      }
    } catch {error(s);}
  };
  stop.onclick=()=>finish();
  window.addEventListener('pagehide',()=>{finish();readingLine.clear();});
})();
