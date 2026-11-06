import DOMPurify from 'dompurify';

export function createRootsSection(word,signal) {
  const el=(tag,text,className)=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  const section=el('details','','dict-source dict-roots');section.open=true;
  const summary=el('summary','');
  const badge=el('span','根','dict-root-badge');badge.setAttribute('aria-hidden','true');
  summary.append(badge,el('span','词根与词源','dict-source-name'),el('small','Word Roots','dict-roots-english'));
  const content=el('div','','dict-root-content');
  const tabs=el('div','','dict-root-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','选择词族');
  const description=el('p','','dict-root-description');
  const body=el('div','','root-lesson');
  const more=el('button','展开精讲','dict-root-more');more.type='button';more.hidden=true;more.setAttribute('aria-expanded','false');
  const footer=el('div','','dict-root-footer');
  const source=el('a','完整词族 ↗');source.target='_blank';source.rel='noopener noreferrer';
  const credit=el('a','来源与许可');credit.href='/dictionary/root-doc?path='+encodeURIComponent('来源与许可.md');credit.target='_blank';credit.rel='noopener noreferrer';
  footer.append(source,credit,el('small','word_root · AI 编写学习讲解'));
  footer.hidden=true;
  content.append(el('p','正在读取词根…','dict-muted'));section.append(summary,content);
  let serial=0,disposed=false;
  const updateOverflow=()=>{more.hidden=body.scrollHeight<=300;body.classList.toggle('has-overflow',!more.hidden);};
  const observer=new ResizeObserver(updateOverflow);observer.observe(body);
  more.onclick=()=>{const expanded=body.classList.toggle('is-expanded');more.textContent=expanded?'收起精讲':'展开精讲';more.setAttribute('aria-expanded',String(expanded));};
  async function request(url) {
    const response=await fetch(url,{signal});const data=await response.json();
    if(!response.ok) throw new Error(data.error || '词根暂时无法读取');return data;
  }
  function errorMessage(error) {
    if(signal.aborted || disposed) return;
    body.replaceChildren(el('p',error.message,'dict-muted'));footer.hidden=true;
    const retry=el('button','重试');retry.type='button';retry.onclick=load;body.append(retry);
  }
  async function select(entry) {
    const run=++serial;
    for(const button of tabs.children) button.setAttribute('aria-pressed',String(button.dataset.id===entry.id));
    description.textContent=entry.meaning;
    body.classList.remove('is-expanded');more.hidden=true;more.textContent='展开精讲';more.setAttribute('aria-expanded','false');footer.hidden=true;
    body.replaceChildren(el('p','正在读取精讲…','dict-muted'));
    try {
      const data=await request('/dictionary/roots?'+new URLSearchParams({word,id:entry.id}));
      if(signal.aborted || disposed || run!==serial) return;
      body.innerHTML=DOMPurify.sanitize(data.html);
      requestAnimationFrame(()=>{if(!disposed && run===serial) updateOverflow();});
      source.href=data.url;footer.hidden=false;
    }catch(error){if(run===serial) errorMessage(error);}
  }
  async function load() {
    try {
      const data=await request('/dictionary/roots?'+new URLSearchParams({word}));
      if(signal.aborted || disposed) return;
      content.replaceChildren();tabs.replaceChildren();
      if(!data.entries.length) return;
      if(data.matched!==word) content.append(el('p','原形：'+data.matched,'dict-muted'));
      for(const entry of data.entries) {
        const button=el('button',entry.root);button.type='button';button.dataset.id=entry.id;button.title=entry.meaning;
        button.onclick=()=>select(entry);tabs.append(button);
      }
      content.append(tabs,description,body,more,footer);
      await select(data.entries[0]);
    }catch(error){content.replaceChildren(body);errorMessage(error);}
  }
  load();
  return {section,dispose(){disposed=true;observer.disconnect();}};
}
