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
  player.innerHTML = '<span role="status" aria-live="polite"></span><button type="button" class="reading-toggle" aria-label="播放朗读" title="播放朗读（空格）"></button><small class="reading-notice" role="status"></small>';
  const status = player.querySelector('span[role=status]');
  const pause = player.querySelector('.reading-toggle');
  const notice=player.querySelector('.reading-notice');
  document.body.append(trigger);
  scroll.before(player);
  // Match the actual article inset, including responsive margins and side panels.
  function alignPlayer() {
    const inset=article.getBoundingClientRect().left+parseFloat(getComputedStyle(article).paddingLeft)-player.getBoundingClientRect().left;
    player.style.setProperty('--reading-inset',Math.max(0,inset)+'px');
  }
  const playerAlignment=new ResizeObserver(alignPlayer);
  playerAlignment.observe(article);
  playerAlignment.observe(scroll);
  window.addEventListener('resize',alignPlayer);
  alignPlayer();
  trigger.hidden=true;
  let currentWord=null;
  const readingLine=createReadingLine(scroll,{onWord:word=>{currentWord=word;updateStatus(session);}});
  const chapterURL=new URL(document.querySelector('.chapter-item[aria-current]').href);
  const book=chapterURL.searchParams.get('book'),chapter=chapterURL.searchParams.get('chapter');
  const positionURL='/reading-position?'+new URLSearchParams({book});
  const readableBlocks=()=>[...article.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption')].filter(b=>!b.closest('nav')&&!b.querySelector('p,li,figcaption'));
  let lastPosition=null,positionLoaded=false,pendingPosition=null,saving=false,retryTimer;
  async function flushPosition() {
    if(saving||!pendingPosition)return;
    saving=true;
    const position=pendingPosition;
    try {
      const response=await fetch(positionURL,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({position})});
      if(!response.ok)throw new Error('save');
      if(pendingPosition===position)pendingPosition=null;
      notice.textContent='';
    } catch {
      notice.textContent='朗读位置暂未保存，正在重试';
      clearTimeout(retryTimer);retryTimer=setTimeout(flushPosition,3000);
    } finally {
      saving=false;
      if(pendingPosition && pendingPosition!==position)void flushPosition();
    }
  }
  function remember(part) {
    const position={chapter,block:readableBlocks().indexOf(part.block),text:part.block.textContent,offset:part.sentenceOffset,sentence:part.sentence,lang:part.lang};
    if(lastPosition?.chapter===chapter && lastPosition.block===position.block && lastPosition.offset===position.offset && lastPosition.text===position.text)return;
    lastPosition=position;pendingPosition=position;void flushPosition();
  }
  function resumeRange() {
    const blocks=readableBlocks();
    if(!lastPosition) {
      const block=blocks.find(b=>b.matches('p')&&/[\p{L}\p{N}]/u.test(b.textContent))||blocks[0];
      if(!block)return null;
      const range=document.createRange();range.selectNodeContents(block);return range;
    }
    if(lastPosition.chapter!==chapter) {
      location.href='/?'+new URLSearchParams({book,chapter:lastPosition.chapter,resumeReading:'1'});return null;
    }
    let block=blocks[lastPosition.block];
    if(block?.textContent!==lastPosition.text) {
      const matches=blocks.filter(b=>b.textContent===lastPosition.text);
      block=matches.length===1?matches[0]:null;
    }
    if(!block){notice.textContent='原文已变化，请在正文中重新选择朗读位置';return null;}
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
    let offset=lastPosition.offset;
    while(walker.nextNode()) {
      const node=walker.currentNode;
      if(offset<node.length){const range=document.createRange();range.selectNodeContents(block);range.setStart(node,offset);block.scrollIntoView({block:'center'});return range;}
      offset-=node.length;
    }
    return null;
  }
  let activeParagraph;
  function setParagraphControl(button,state) {
    const playing=state==='playing';
    button.title=button.ariaLabel=playing?'暂停本段朗读':state==='paused'?'继续本段朗读':'从本段开始朗读';
    button.setAttribute('aria-pressed',String(playing));
    button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24">'+(playing?'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>':'<path d="m9 5 11 7-11 7Z"/>')+'</svg>';
  }
  function markParagraph(block) {
    const wrapper=block?.closest('.speech-paragraph');
    if(wrapper===activeParagraph) return;
    if(activeParagraph) {
      activeParagraph.classList.remove('is-reading');
      setParagraphControl(activeParagraph.querySelector('.paragraph-play'),'idle');
    }
    activeParagraph=wrapper;
    if(wrapper) {
      wrapper.classList.add('is-reading');
      showPause(session?.paused ?? false);
    }
  }
  function showPause(paused) {
    pause.title=pause.ariaLabel=paused?'继续朗读（空格）':'暂停朗读（空格）';
    pause.setAttribute('aria-pressed',String(!paused));
    pause.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(paused?'<path d="m8 4 12 8-12 8Z"/>':'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>')+'</svg>';
    const paragraphButton=activeParagraph?.querySelector('.paragraph-play');
    if(paragraphButton)setParagraphControl(paragraphButton,paused?'paused':'playing');
  }
  let selected, session, context;
  document.addEventListener('dictionary-pronounce',()=>{
    if(session && !session.paused) pause.click();
  });
  function updateStatus(s) {
    player.dataset.state=s?.loading?'loading':s&&!s.paused?'playing':'paused';
    const playing=s&&!s.paused;
    const sentence=(playing?s.currentPart?.sentence:null)||lastPosition?.sentence;
    const label=playing?'正在读：':'上次读到：';
    const labelNode=document.createElement('span');
    labelNode.className='reading-label';labelNode.textContent=label;
    const text=sentence||'暂无朗读记录';
    status.title=label+text;
    const part=s?.currentPart;
    const offset=currentWord && part?.block===currentWord.block?currentWord.start-part.sentenceOffset:-1;
    const end=currentWord && part?currentWord.end-part.sentenceOffset:-1;
    if(text===part?.sentence && offset>=0 && end<=text.length && end>offset) {
      const bold=document.createElement('strong');bold.textContent=text.slice(offset,end);
      status.replaceChildren(labelNode,document.createTextNode(text.slice(0,offset)),bold,document.createTextNode(text.slice(end)));
      // Keep the current word visible when a long sentence exceeds the bar width.
      const bounds=status.getBoundingClientRect(),wordBounds=bold.getBoundingClientRect();
      if(wordBounds.right>bounds.right)status.scrollLeft+=wordBounds.right-bounds.right+12;
      else if(wordBounds.left<bounds.left)status.scrollLeft+=wordBounds.left-bounds.left-12;
    } else {status.replaceChildren(labelNode,document.createTextNode(text));status.scrollLeft=0;}
    showPause(!playing);
  }
  pause.disabled=true;
  void (async()=>{
    try {
      const response=await fetch(positionURL,{cache:'no-store'});
      if(!response.ok)throw new Error('load');
      const saved=(await response.json()).position;
      if(!pendingPosition && !session)lastPosition=saved;
      positionLoaded=true;
    }catch {notice.textContent='无法读取上次朗读位置，请刷新重试';}
    finally {pause.disabled=!positionLoaded;updateStatus(session);}
    const url=new URL(location.href);
    if(url.searchParams.has('resumeReading')) {
      url.searchParams.delete('resumeReading');history.replaceState(null,'',url);
      if(lastPosition?.chapter===chapter){const range=resumeRange();if(range)void startReading(range,true);}
    }
  })();
  updateStatus();

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
      if(voice!==voiceSelect.value && session) finish();
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
    setParagraphControl(button,'idle');
    paragraph.before(wrapper);
    wrapper.append(button,paragraph);
    button.addEventListener('click',()=>{
      if(wrapper===activeParagraph && session){pause.click();return;}
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
      const sentences=new Intl.Segmenter(lang,{granularity:'sentence'}).segment(paragraphText);
      for(const {segment,index} of sentences) {
        if(index+segment.length<=start)continue;
        const sentence=segment.trim();
        const sentenceOffset=index+segment.indexOf(sentence);
        const remainder=segment.slice(Math.max(0,start-index));
        let rest=remainder.trim();
        let offset=Math.max(index,start)+remainder.indexOf(rest);
        while(rest) {
          // Keep English sentences together so the model can preserve their rhythm.
          const limit=lang==='zh'?95:450;
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
            yield {text,lang,block,offset:partOffset,sentence,sentenceOffset};
          }
        }
      }
    }
  }
  function finish(message='') {
    readingLine.freeze();
    if(session) {
      session.controller.abort();
      if(session.source) { session.source.onended=null; session.source.stop(); session.source.disconnect(); }
    }
    session=undefined;
    markParagraph(null);updateStatus();
    if(message)notice.textContent=message;
    void flushPosition();
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
    s.loading=false;s.lang=part.lang;s.currentPart=part;
    if(!s.paused)remember(part);
    updateStatus(s);
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
    if(s.paused)s.pendingFollow={part,buffer,start};
    else readingLine.follow(part,buffer,context,start);
  }
  async function startReading(range,autoplay=false) {
    const parts=passage(range);
    const first=parts.next();
    if(first.done) return;
    finish();
    readingLine.clear();
    const s={parts,controller:new AbortController(),paused:false,loading:true,lang:first.value.lang,currentPart:first.value};
    session=s;
    positionLoaded=true;pause.disabled=false;
    markParagraph(first.value.block);
    getSelection().removeAllRanges();hideTrigger();
    notice.textContent='';showPause(false);updateStatus(s);
    try {
      context ??= new AudioContext();
      // Navigation may require a fresh gesture before Web Audio can resume.
      const activationTimer=autoplay?setTimeout(()=>{
        if(session===s && context.state==='suspended' && !s.paused){s.paused=true;updateStatus(s);notice.textContent='点击播放或按空格继续';}
      },350):null;
      try{await context.resume();}finally{clearTimeout(activationTimer);}
      if(session!==s)return;
      if(s.paused)await context.suspend();
      await play(first.value,await load(first.value,s),s);
    } catch {error(s);}
  }
  trigger.addEventListener('click',()=>{
    if(selected) startReading(selected.cloneRange());
  });
  pause.onclick=async()=>{
    const s=session;
    if(!s) {if(positionLoaded){const range=resumeRange();if(range)void startReading(range);}return;}
    if(!context)return;
    s.paused=!s.paused;
    showPause(s.paused);
    updateStatus(s);
    try {
      if(s.paused) {
        void flushPosition();
        await context.suspend();
        if(session===s && s.paused) readingLine.freeze();
      } else {
        await context.resume();
        if(session===s && s.currentPart && !s.loading)remember(s.currentPart);
        if(session===s && !s.paused) {
          if(s.pendingFollow) {
            const {part,buffer,start}=s.pendingFollow;s.pendingFollow=null;
            readingLine.follow(part,buffer,context,start);
          } else readingLine.resume();
        }
      }
    } catch {error(s);}
  };
  document.addEventListener('keydown',event=>{
    if(event.code!=='Space'||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,#dictionary-panel,#selection-toolbar'))return;
    if(event.target.closest('button,a,[role="button"]')&&!event.target.closest('.reading-toggle,.paragraph-play'))return;
    event.preventDefault();
    if(!event.repeat)pause.click();
  });
  window.addEventListener('bookshelf-synced',()=>void flushPosition());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)void flushPosition();});
  window.addEventListener('pagehide',()=>{finish();readingLine.clear();});
})();
