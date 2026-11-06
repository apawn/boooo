import {normalizeWord,selectedWord} from './dictionary/word.js';
import {searchDictionary,renderDictionary,dictionaryIcons,createWordbook,createRootsSection} from './dictionary/saladict/bundle.js';

const icons={back:'M15 3 6 12l9 9',forward:'m9 3 9 9-9 9',search:'M20 20 15 15 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',menu:'M3 5h18M3 12h18M3 19h18',heart:'M12 21 3 12C-3 4 7-1 12 6 17-1 27 4 21 12Z',bookmark:'M5 2h14v20l-7-5-7 5Z M12 5l1.3 3 3.2.3-2.4 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.4-2.1 3.2-.3Z',pin:'m7 2 15 15-5 1-3 4-4-8-8-4 4-3Z M14 14l-9 9',close:'m3 3 18 18M21 3 3 21'};
const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons[name]+'"/></svg>';
const tool=(name,label)=>'<button class="dict-tool dict-'+name+'" type="button" aria-label="'+label+'" title="'+label+'">'+svg(name)+'</button>';

const article = document.querySelector('article');
const scroller = document.querySelector('#scroll');
const panel = document.createElement('section');
panel.id = 'dictionary-panel';
panel.hidden = true;
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', '英文单词词典');
panel.innerHTML = '<header class="dict-header">'+tool('back','上一条查询')+tool('forward','下一条查询')+'<form class="dict-search"><input id="dict-word" aria-label="查询英文单词" autocomplete="off" spellcheck="false"><button class="dict-tool" type="submit" aria-label="查询" title="查询">'+svg('search')+'</button></form><span class="dict-toolbar-space"></span>'+tool('menu','查询历史')+tool('heart','收藏单词')+tool('bookmark','生词本')+tool('pin','固定词典')+tool('close','关闭词典')+'</header><div class="dict-toolbar-menu" hidden></div>' +
  '<div class="dict-audio-status" role="status"></div><div class="dict-scroll"><div class="dict-sources"></div><details class="dict-local"><summary>本地词库 · 离线参考</summary><div class="dict-result"></div></details><div class="dict-context"></div></div>' +
  '<footer><span>词典原声 · 英美音分列</span><a href="https://github.com/crimx/ext-saladict" target="_blank" rel="noopener noreferrer">基于 Saladict 开源词典模块</a></footer>';
document.body.append(panel);
const $ = selector => panel.querySelector(selector);
const result = $('.dict-result');
const audioStatus = $('.dict-audio-status');
const cache = new Map();
const providers = [
  ['cambridge','Cambridge Dictionary'],['vocabulary','Vocabulary.com'],
  ['bing','Bing Dict'],['youdao','Youdao Dictionary'],
];
const sourceUrl=(provider,word)=>({
  cambridge:'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/',
  vocabulary:'https://www.vocabulary.com/dictionary/',
  bing:'https://cn.bing.com/dict/search?q=',youdao:'https://dict.youdao.com/w/',
}[provider]+encodeURIComponent(word));
let anchor, lastKey = '', request, audio, timer, dragging = false;
let disposeViews=[];
const history=[];
let historyIndex=-1, currentWord='', currentSource=null, pinned=false;
const wordbook=createWordbook({article,scroller,onChange:updateToolbar,onNavigate:close,
  onLookup:(word,rect,source)=>openWord(word,rect,source?.text || '',true,source)});
function updateToolbar() {
  $('.dict-back').disabled=historyIndex<=0;
  $('.dict-forward').disabled=historyIndex>=history.length-1;
  $('.dict-heart').setAttribute('aria-pressed',String(wordbook.has(currentWord)));
  $('.dict-heart').disabled=!wordbook.isReady();
  $('.dict-pin').setAttribute('aria-pressed',String(pinned));
}
function showWordList(words,empty) {
  const menu=$('.dict-toolbar-menu');
  if(!menu.hidden) {menu.hidden=true;return;}
  menu.replaceChildren();menu.hidden=false;
  if(!words.length) menu.append(el('p',empty));
  for(const word of words) {
    const button=el('button',word);button.type='button';
    button.onclick=()=>openWord(word,anchor,'');menu.append(button);
  }
}
$('.dict-search').onsubmit=event=>{
  event.preventDefault();const word=normalizeWord($('#dict-word').value);
  if(word) openWord(word,anchor,'');
};
for(const [name,step] of [['back',-1],['forward',1]]) $('.dict-'+name).onclick=()=>{
  const entry=history[historyIndex+step];if(!entry) return;
  historyIndex+=step;openWord(entry.word,anchor,entry.context,false,entry.source);
};
$('.dict-menu').onclick=()=>showWordList([...new Set(history.map(entry=>entry.word))].reverse(),'还没有查询记录');
$('.dict-bookmark').onclick=()=>{close();wordbook.open();};
$('.dict-heart').onclick=()=>wordbook.toggle(currentWord,currentSource);
$('.dict-pin').onclick=()=>{pinned=!pinned;updateToolbar();};

function el(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function lines(text) { return (text || '').replaceAll('\\n', '\n').split('\n').filter(Boolean); }
function stopAudio() {
  if(audio) {audio.pause();audio.removeAttribute('src');audio.load();audio=null;}
  audioStatus.textContent = '';
}
function close() {
  panel.hidden = true;
  document.documentElement.classList.remove('dictionary-open');
  request?.abort(); stopAudio();
  clearTimeout(timer);
}
$('.dict-close').onclick = close;
document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
scroller.addEventListener('scroll', ()=>{if(!pinned) close();}, {passive:true});
function position() {
  if (panel.hidden || !anchor) return;
  const viewport = window.visualViewport;
  const width = viewport?.width || innerWidth;
  const height = viewport?.height || innerHeight;
  const left = viewport?.offsetLeft || 0;
  const top = viewport?.offsetTop || 0;
  const below = top + height - anchor.bottom - 18;
  const above = anchor.top - top - 18;
  const preferredHeight = Math.min(800,height-32);
  const useBelow = below >= Math.min(480,preferredHeight);
  const useAbove = !useBelow && above >= Math.min(480,preferredHeight);
  panel.style.maxHeight = Math.min(preferredHeight,useBelow?below:useAbove?above:preferredHeight) + 'px';
  panel.style.height = panel.style.maxHeight;
  const box = panel.getBoundingClientRect();
  const y = useBelow
    ? Math.min(anchor.bottom + 10, top + height - box.height - 8)
    : useAbove ? anchor.top - box.height - 10 : top+(height-box.height)/2;
  panel.style.left = Math.max(left + 16, Math.min(anchor.left-24, left + width - box.width - 16)) + 'px';
  panel.style.top = Math.max(top + 16, y) + 'px';
}
window.addEventListener('resize', close);
window.visualViewport?.addEventListener('resize', close);
new ResizeObserver(position).observe(panel);

const formNames = {p:'过去式', d:'过去分词', i:'现在分词', '3':'第三人称单数', r:'比较级', t:'最高级', s:'复数', '0':'原形'};
function entryView(entry, root = false) {
  const section = el('section', '', 'dict-entry');
  section.append(el('h3', root ? '原形 · ' + entry.word : '英汉释义'));
  for (const line of lines(entry.translation)) section.append(el('p', line, 'dict-translation'));
  if (!entry.translation) section.append(el('p', '此词条暂无中文释义。', 'dict-muted'));
  const english = lines(entry.definition);
  if (english.length) {
    const details = document.createElement('details');
    details.append(el('summary', '英文释义'));
    for (const line of english) details.append(el('p', line, 'dict-definition'));
    section.append(details);
  }
  const forms = (entry.exchange || '').split('/').map(item => item.split(':')).filter(([kind, value]) => formNames[kind] && value);
  if (forms.length) {
    const list = el('div', '', 'dict-forms');
    for (const [kind, value] of forms) list.append(el('span', formNames[kind] + ' ' + value));
    section.append(list);
  }
  return section;
}

async function openWord(word, rect, context, record=true, source=null) {
  close();
  for(const dispose of disposeViews) dispose();
  disposeViews=[];
  anchor = rect;
  $('.dict-scroll').scrollTop = 0;
  currentWord=word;currentSource=source || wordbook.findSource(word);
  $('#dict-word').value = word;
  $('.dict-toolbar-menu').hidden=true;
  if(record && history[historyIndex]?.word!==word) {
    history.splice(historyIndex+1);history.push({word,context,source:currentSource});historyIndex=history.length-1;
  }
  updateToolbar();
  result.replaceChildren(el('p', '正在读取本地词库…', 'dict-muted'));
  $('.dict-local').open=false;
  const sources=$('.dict-sources');sources.replaceChildren();
  const contextBox = $('.dict-context');
  contextBox.replaceChildren();
  if (context) contextBox.append(el('h3', '书中原句'), el('p', context));
  panel.hidden = false;
  document.documentElement.classList.add('dictionary-open');
  position();
  const controller = request = new AbortController();
  const roots=createRootsSection(word,controller.signal);
  disposeViews.push(roots.dispose);
  const local = (async()=>{
    try {
      let data=cache.get(word);
      if(!data) {
        const response=await fetch('/dictionary?word='+encodeURIComponent(word),{signal:controller.signal});
        data=await response.json();
        if(!response.ok) throw new Error(data.error);
        if(cache.size>=100) cache.delete(cache.keys().next().value);
        cache.set(word,data);
      }
      if(controller.signal.aborted) return null;
      result.replaceChildren();
      if(data.entry) {
        result.append(entryView(data.entry));
        for(const entry of data.roots.slice(0,2)) result.append(entryView(entry,true));
      }
      return data;
    } catch(error) {
      if(!controller.signal.aborted) result.replaceChildren(el('p',error.message,'dict-muted'));
      return null;
    }
  })();
  let failures=0;
  for(const [provider,label] of providers) {
    const section=document.createElement('details');section.open=true;section.className='dict-source';section.dataset.provider=provider;
    const summary=el('summary','');
    const badge=document.createElement('img');badge.className='dict-source-badge';badge.src=dictionaryIcons[provider];badge.alt='';
    const link=el('a',label,'dict-source-name');link.href=sourceUrl(provider,word);link.target='_blank';link.rel='noopener noreferrer';link.title='打开 '+label+' 原站';
    const options=el('button','⋮','dict-source-options');options.type='button';options.setAttribute('aria-label',label+' 选项');
    const actions=el('div','','dict-source-actions');actions.hidden=true;
    const original=el('a','打开原站');original.href=link.href;original.target='_blank';original.rel='noopener noreferrer';
    actions.append(original);
    options.onclick=event=>{event.preventDefault();actions.hidden=!actions.hidden;};
    summary.append(badge,link,options);section.append(summary,actions);
    const content=el('div','','dict-provider-content dict-'+provider);
    content.append(el('p','正在查询…','dict-muted'));section.append(content);
    const more=el('button','','dict-more');more.type='button';more.hidden=true;more.setAttribute('aria-expanded','false');more.setAttribute('aria-label','展开全部');
    more.onclick=()=>{
      const expanded=section.classList.toggle('is-expanded');
      more.setAttribute('aria-label',expanded?'收起内容':'展开全部');more.setAttribute('aria-expanded',String(expanded));
      if(!expanded) section.scrollIntoView({block:'nearest'});
    };
    content.addEventListener('focusin',event=>{
      if(!more.hidden && !section.classList.contains('is-expanded') &&
        event.target.getBoundingClientRect().bottom>content.getBoundingClientRect().bottom-30) more.click();
    });
    section.append(more);sources.append(section);
    if(provider==='cambridge') sources.append(roots.section);
    const load=async()=>{
      let actualWord=word;
      content.replaceChildren(el('p','正在查询…','dict-muted'));
      try {
        let data;
        try {data=await searchDictionary(provider,word);}
        catch(error) {
          const entry=await local;
          const base=entry?.roots?.[0]?.word || entry?.entry?.word;
          if(error.message!=='NO_RESULT' || !base || base.toLowerCase()===word || controller.signal.aborted) throw error;
          actualWord=base;data=await searchDictionary(provider,base);
        }
        if(controller.signal.aborted) return;
        content.replaceChildren();link.href=data.url;original.href=data.url;
        if(actualWord!==word) content.append(el('p','原形：'+actualWord,'dict-muted'));
        if(provider==='vocabulary' && data.pronunciations.length) {
          const prons=el('div','','dict-pronunciation');
          for(const pron of data.pronunciations) {
            const item=el('span',(pron.accent==='uk'?'英 ':'美 ')+(pron.ipa || ''));
            if(pron.audio) {
              const button=el('button','','dict-recording');button.type='button';button.dataset.dictionaryAudio=pron.audio;
              button.setAttribute('aria-label',pron.accent==='uk'?'播放英国发音':'播放美国发音');item.append(button);
            }
            prons.append(item);
          }
          content.append(prons);
        }
        const view=el('div','','dict-view');content.append(view);
        disposeViews.push(renderDictionary(view,provider,data));
        const observer=new ResizeObserver(()=>{
          if(!section.open) return;
          const overflow=content.scrollHeight>360;
          more.hidden=!overflow;section.classList.toggle('has-more',overflow);
        });
        observer.observe(view);disposeViews.push(()=>observer.disconnect());
      } catch(error) {
        if(controller.signal.aborted) return;
        content.replaceChildren();
        if(error.message!=='NO_RESULT') {
          const message=error.message==='MANUAL_VERIFICATION'?'原站需要浏览器验证，请点击原站查看。':'暂时连接不上，可以重试或打开原站。';
          content.append(el('p',message,'dict-muted'));
          const retry=el('button','重试');retry.type='button';retry.onclick=load;content.append(retry);
        }
        if(++failures>=providers.length) $('.dict-local').open=true;
      }
    };
    load();
  }
}

function selectionWord() {
  const selection = getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!article.contains(range.commonAncestorContainer)) return null;
  const parent = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  if (parent.closest('nav,button,a,pre,code')) return null;
  const block = parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,figcaption');
  if (!block || !block.contains(range.endContainer)) return null;
  const raw = selection.toString();
  const word = normalizeWord(raw);
  if (!word) return null;
  // Initial letters may live in separate spans. Measure against the entire block.
  const before = range.cloneRange();
  before.selectNodeContents(block); before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const text = block.textContent;
  const begin = start + raw.length - raw.trimStart().length;
  if (!selectedWord(text,start,start+raw.length)) return null;
  let context = '';
  for (const part of new Intl.Segmenter('en', {granularity:'sentence'}).segment(text)) {
    if (part.index <= begin && part.index + part.segment.length > begin) {
      context = part.segment.trim(); break;
    }
  }
  if (context.length > 600) context = context.slice(0, 600) + '…';
  const rect = range.getBoundingClientRect();
  const bounds = scroller.getBoundingClientRect();
  if (!rect.width || rect.bottom <= bounds.top || rect.top >= bounds.bottom) return null;
  return {word, rect, context, source:wordbook.capture(block,begin), key:word + ':' + begin + ':' + text};
}
function checkSelection() {
  clearTimeout(timer);
  if(panel.contains(document.activeElement)) return;
  if (dragging) return;
  timer = setTimeout(() => {
    const selected = selectionWord();
    if (!selected) {
      // Selecting/copying text inside the dictionary must not dismiss it.
      if (panel.contains(getSelection()?.anchorNode)) return;
      lastKey = ''; if(!pinned) close(); return;
    }
    if (selected.key === lastKey) return;
    lastKey = selected.key;
    openWord(selected.word, selected.rect, selected.context,true,selected.source);
  }, 160);
}
document.addEventListener('selectionchange', checkSelection);
document.addEventListener('pointerdown', event => {
  if (panel.contains(event.target)) return;
  dragging = true; clearTimeout(timer); if(!pinned) close(); lastKey = '';
});
document.addEventListener('pointerup', event => { dragging = false; if(!panel.contains(event.target)) checkSelection(); });
document.addEventListener('pointercancel', () => { dragging = false; });

panel.addEventListener('click', async event => {
  const button=event.target.closest('[data-dictionary-audio]');
  if(!button) return;
  event.preventDefault();
  stopAudio();
  document.dispatchEvent(new Event('dictionary-pronounce'));
  const recording=audio=new Audio('/dictionary/media?'+new URLSearchParams({url:button.dataset.dictionaryAudio}));
  audioStatus.textContent='正在加载词典原声…';
  recording.onended=()=>{if(audio===recording) stopAudio();};
  recording.onerror=()=>{if(audio===recording) audioStatus.textContent='原声暂时无法播放，请重试或前往原站。';};
  try {
    await recording.play();
    if(audio===recording) audioStatus.textContent='正在播放词典原声';
  } catch {
    if(audio===recording) audioStatus.textContent='原声暂时无法播放，请重试或前往原站。';
  }
});
