import {normalizeFavorites,locateWord} from './wordbook-model.js';

const storageKey='dictionary-wordbook-v1';
const blocksSelector='p,h1,h2,h3,h4,h5,h6,li,td,figcaption';
export function createWordbook({article,scroller,onLookup,onChange,onNavigate}) {
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let entries=[];
  try {entries=normalizeFavorites(JSON.parse(read(storageKey) || read('dictionary-favorites') || '[]'));}catch{}
  const blocks=()=>[...article.querySelectorAll(blocksSelector)].filter(block=>!block.closest('nav,pre,code') && !block.querySelector(blocksSelector));
  const pageURL=()=>{
    const current=document.querySelector('.chapter-item[aria-current]');
    const url=new URL(current?.href || location.href);
    return url.pathname+url.search;
  };
  const node=(tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
  const toggle=node('button','单词本','wordbook-toggle');toggle.type='button';toggle.id='wordbook-toggle';toggle.setAttribute('aria-controls','wordbook');toggle.setAttribute('aria-expanded','false');
  (document.querySelector('.speech-statusbar') || document.querySelector('.reader-tools')).append(toggle);
  const layout=node('div','','reader-content');scroller.before(layout);layout.append(scroller);
  const sidebar=node('aside','','wordbook');sidebar.id='wordbook';sidebar.setAttribute('aria-label','单词本');sidebar.inert=true;
  const inner=node('div','','wordbook-inner');
  const header=node('header','','wordbook-header');
  const heading=node('div');heading.append(node('strong','单词本'),node('small','Vocabulary'));
  const count=node('span','','wordbook-count');
  const dismiss=node('button','×','wordbook-close');dismiss.type='button';dismiss.setAttribute('aria-label','收起单词本');
  header.append(heading,count,dismiss);
  const list=node('div','','wordbook-list');
  const status=node('p','','wordbook-status');status.setAttribute('role','status');
  inner.append(header,list,status);sidebar.append(inner);layout.append(sidebar);
  function setOpen(open) {
    layout.classList.toggle('wordbook-open',open);sidebar.inert=!open;
    toggle.setAttribute('aria-expanded',String(open));write('dictionary-wordbook-open',String(open));
    if(!open && sidebar.contains(document.activeElement)) toggle.focus();
  }
  toggle.onclick=()=>setOpen(!layout.classList.contains('wordbook-open'));
  dismiss.onclick=()=>setOpen(false);
  function capture(block,offset) {
    if(!block) return null;
    return {url:pageURL(),book:document.querySelector('.crumb-book')?.textContent || '',chapter:document.querySelector('.current-chapter')?.textContent.replace(/^\s*·\s*/,'') || '',block:blocks().indexOf(block),text:block.textContent,offset};
  }
  function findSource(word) {
    const all=blocks(),found=locateWord(all.map(block=>block.textContent),word);
    return found?capture(all[found.block],found.offset):null;
  }
  function save() {
    write(storageKey,JSON.stringify(entries));
    // Preserve compatibility with the previous string-only favorites list.
    write('dictionary-favorites',JSON.stringify(entries.map(entry=>entry.word)));
    render();onChange?.();
  }
  function jump(entry) {
    onNavigate?.();status.textContent='';
    if(entry.source && entry.source.url!==pageURL()) {
      location.assign(entry.source.url+'#wordbook='+encodeURIComponent(entry.word));return;
    }
    const all=blocks(),found=locateWord(all.map(block=>block.textContent),entry.word,entry.source);
    if(!found) {status.textContent='没有找到这条收藏的正文位置。';return;}
    const block=all[found.block];
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
    const range=document.createRange();let offset=0,started=false;
    while(walker.nextNode()) {
      const text=walker.currentNode,end=offset+text.length;
      if(!started && found.offset<end) {range.setStart(text,found.offset-offset);started=true;}
      if(started && found.offset+entry.word.length<=end) {range.setEnd(text,found.offset+entry.word.length-offset);break;}
      offset=end;
    }
    article.querySelector('.wordbook-target')?.classList.remove('wordbook-target');
    block.classList.add('wordbook-target');
    if(globalThis.CSS?.highlights && globalThis.Highlight) CSS.highlights.set('saved-word',new Highlight(range));
    const rect=range.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();
    scroller.scrollTo({top:scroller.scrollTop+rect.top-bounds.top-scroller.clientHeight*.3,behavior:'instant'});
    list.querySelectorAll('[aria-current]').forEach(el=>el.removeAttribute('aria-current'));
    for(const button of list.querySelectorAll('.wordbook-entry')) if(button.dataset.word===entry.word) button.setAttribute('aria-current','true');
    status.textContent='已定位：'+entry.word;
  }
  function render() {
    count.textContent=String(entries.length);list.replaceChildren();
    if(!entries.length) {list.append(node('p','查词时点击 ♡，就能把单词和正文位置存到这里。','wordbook-empty'));return;}
    for(const entry of entries) {
      const row=node('div','','wordbook-row');
      const button=node('button','','wordbook-entry');button.type='button';button.dataset.word=entry.word;
      button.append(node('strong',entry.word));
      const source=entry.source;
      button.append(node('small',source?[source.book,source.chapter].filter(Boolean).join(' · '):'旧收藏 · 未记录原文位置'));
      if(source?.text) {
        const start=Math.max(0,source.offset-36);
        button.append(node('span',(start?'…':'')+source.text.slice(start,start+130)+(source.text.length>start+130?'…':''),'wordbook-quote'));
      }
      button.onclick=()=>jump(entry);
      const lookup=node('button','查词','wordbook-lookup');lookup.type='button';lookup.setAttribute('aria-label','查询 '+entry.word);lookup.onclick=()=>onLookup(entry.word,button.getBoundingClientRect(),source);
      const remove=node('button','×','wordbook-remove');remove.type='button';remove.setAttribute('aria-label','取消收藏 '+entry.word);remove.onclick=()=>{entries=entries.filter(item=>item.word!==entry.word);save();};
      row.append(button,lookup,remove);list.append(row);
    }
  }
  window.addEventListener('storage',event=>{
    if(event.key===storageKey) {try{entries=normalizeFavorites(JSON.parse(event.newValue || '[]'));render();onChange?.();}catch{}}
  });
  render();setOpen(read('dictionary-wordbook-open')==='true');
  const requested=new URLSearchParams(location.hash.slice(1)).get('wordbook');
  const destination=entries.find(entry=>entry.word===requested);
  if(destination) {setOpen(true);requestAnimationFrame(()=>requestAnimationFrame(()=>jump(destination)));}
  return {
    capture,findSource,has:word=>entries.some(entry=>entry.word===word),
    open(){setOpen(true);},
    toggle(word,source) {
      entries=entries.some(entry=>entry.word===word)?entries.filter(entry=>entry.word!==word):[{word,source:source || findSource(word)},...entries];save();
    }
  };
}
