(() => {
  const article = document.querySelector('article');
  const scroll = document.querySelector('#scroll');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'speech-trigger';
  trigger.title = trigger.ariaLabel = '从这里开始朗读';
  trigger.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  const player = document.createElement('div');
  player.className = 'speech-player';
  player.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" class="pause">暂停</button><button type="button" class="stop" aria-label="停止朗读">停止</button>';
  const status = player.querySelector('[role=status]');
  const pause = player.querySelector('.pause');
  const stop = player.querySelector('.stop');
  document.body.append(trigger,player);
  trigger.hidden = player.hidden = true;
  let selected, session, context, highlighted;

  const dialog=document.querySelector('#voice-dialog');
  const voiceSelect=document.querySelector('#mandarin-voice');
  const preview=document.querySelector('#voice-preview');
  let voice=voiceSelect.value;
  try {
    const saved=localStorage.getItem('mandarinVoice');
    if([...voiceSelect.options].some(o=>o.value===saved)) voice=saved;
  } catch {}
  function loadPreview() {
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
      voice=voiceSelect.value;
      try {localStorage.setItem('mandarinVoice',voice);} catch {}
    }
  });
  dialog.onclose=()=>preview.pause();
  function showSelection() {
    const sel = getSelection();
    selected = null;
    trigger.hidden = true;
    if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer) || range.startContainer.parentElement?.closest('.paging')) return;
    const bounds = scroll.getBoundingClientRect();
    const rect = [...range.getClientRects()].find(r=>r.width && r.height && r.bottom>bounds.top && r.top<bounds.bottom);
    if (!rect) return;
    selected = range.cloneRange();
    trigger.hidden=false;
    const {width,height} = trigger.getBoundingClientRect();
    trigger.style.left = Math.max(4, Math.min(innerWidth-width-4, rect.left+(rect.width-width)/2))+'px';
    trigger.style.top = Math.max(4, rect.top>height+7 ? rect.top-height-6 : rect.bottom+5)+'px';
  }
  document.addEventListener('selectionchange',showSelection);
  scroll.addEventListener('scroll',showSelection,{passive:true});
  window.addEventListener('resize',showSelection);
  trigger.addEventListener('pointerdown',e=>e.preventDefault());

  // Read the selection's first character through the end of this chapter.
  function* passage(range) {
    let first=true;
    const blocks=article.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption');
    for(const block of blocks) {
      if(block.closest('nav') || block.querySelector('p,li,figcaption') || range.comparePoint(block,block.childNodes.length)<0) continue;
      const fragment=document.createRange();
      fragment.selectNodeContents(block);
      if(block.contains(range.startContainer)) fragment.setStart(range.startContainer,range.startOffset);
      const full=fragment.toString().trim();
      if(!full) continue;
      const locale=/\p{Script=Han}/u.test(full)?'zh':'en';
      const sentences=new Intl.Segmenter(locale,{granularity:'sentence'}).segment(full);
      for(const {segment} of sentences) {
        let rest=segment.trim();
        while(rest) {
          const lang=/\p{Script=Han}/u.test(rest)?'zh':'en';
          const limit=lang==='zh'?(first?34:95):(first?95:235);
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
          rest=rest.slice(end).trim();
          if(/[\p{L}\p{N}]/u.test(text)) {
            first=false;
            yield {text,lang,block};
          }
        }
      }
    }
  }
  function finish() {
    if(session) {
      session.controller.abort();
      if(session.source) { session.source.onended=null; session.source.stop(); session.source.disconnect(); }
    }
    session=undefined;
    highlighted?.classList.remove('speech-current'); highlighted=undefined;
    player.hidden=true;
  }
  async function load(part,s) {
    const result=await fetch('/speech',{method:'POST',signal:s.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text:part.text,lang:part.lang,voice:part.lang==='zh'?voice:undefined})});
    if(!result.ok) throw new Error('Synthesis failed');
    return context.decodeAudioData(await result.arrayBuffer());
  }
  function error(s) {
    if(s!==session) return;
    finish();
    player.hidden=false;pause.hidden=true;status.textContent='朗读失败，请重新选中文字再试。';
  }
  // Prepare one sentence ahead while the current sentence plays.
  async function play(part,buffer,s) {
    if(session!==s) return;
    const source=context.createBufferSource();
    source.buffer=buffer;source.connect(context.destination);s.source=source;
    if(highlighted!==part.block) {
      highlighted?.classList.remove('speech-current');highlighted=part.block;highlighted.classList.add('speech-current');
      const rect=highlighted.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
      if(rect.top>=viewport.bottom || rect.bottom<=viewport.top) highlighted.scrollIntoView({block:'start'});
    }
    status.textContent=s.paused?'已暂停':(part.lang==='zh'?'普通话朗读':'英文朗读');
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
      if(next.done) return finish();
      try {
        let buffer=await prepared;
        if(session===s && next.value.lang==='zh' && preparedVoice!==voice) buffer=await load(next.value,s);
        await play(next.value,buffer,s);
      } catch { error(s); }
    };
    source.start();
  }
  trigger.addEventListener('click',async()=>{
    if(!selected) return;
    const parts=passage(selected.cloneRange());
    const first=parts.next();
    if(first.done) return;
    finish();
    const s={parts,controller:new AbortController(),paused:false};
    session=s;
    getSelection().removeAllRanges();trigger.hidden=true;
    player.hidden=false;pause.hidden=false;pause.textContent='暂停';status.textContent='正在准备朗读…';
    try {
      context ??= new AudioContext();
      await context.resume();
      await play(first.value,await load(first.value,s),s);
    } catch {error(s);}
  });
  pause.onclick=async()=>{
    const s=session;
    if(!s || !context) return;
    s.paused=!s.paused;
    pause.textContent=s.paused?'继续':'暂停';
    status.textContent=s.paused?'已暂停':'正在朗读';
    try { if(s.paused) await context.suspend(); else await context.resume(); } catch {error(s);}
  };
  stop.onclick=finish;
  window.addEventListener('pagehide',finish);
})();
