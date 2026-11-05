(() => {
  const root = document.documentElement;
  const local = {
    get(key) { try { return localStorage.getItem('books-reader.' + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem('books-reader.' + key, value); } catch {} }
  };
  const compact = matchMedia('(max-width:620px)');
  const foldKey = () => compact.matches ? 'mobileFolded' : 'folded';
  const applyFold = () => { root.dataset.folded = local.get(foldKey()) || (compact.matches ? 'yes' : 'no'); };
  const storedSize = Number(local.get('size'));
  let size = storedSize >= 15 && storedSize <= 27 ? storedSize : 19;
  applyFold();
  root.style.setProperty('--size', size + 'px');
  document.addEventListener('DOMContentLoaded', () => {
    const article=document.querySelector('article');
    const voiceButton=document.querySelector('#voice-settings');
    const emphasisOptions=[
      {key:'englishInitials',className:'emphasize-english',label:'英文词首',title:'加粗每个英文单词的首字母'},
      {key:'chineseInitials',className:'emphasize-chinese',label:'中文句首',title:'加粗每个中文句子的第一个汉字'},
    ];
    // Mark once, then toggle only CSS: live speech ranges and text offsets stay valid.
    const wordSegments=new Intl.Segmenter('en',{granularity:'word'});
    const sentenceSegments=new Intl.Segmenter('zh',{granularity:'sentence'});
    const blocks='p,h1,h2,h3,h4,h5,h6,li,figcaption,td,th';
    for(const block of article.querySelectorAll(blocks)) {
      if(block.closest('nav,pre,code') || block.querySelector(blocks)) continue;
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
      const nodes=[];
      let text='';
      while(walker.nextNode()) {
        const node=walker.currentNode;
        nodes.push({node,start:text.length,end:text.length+node.length});
        text+=node.data;
      }
      const initials=[];
      for(const part of wordSegments.segment(text)) {
        if(part.isWordLike && /^\p{Script=Latin}/u.test(part.segment)) {
          const letter=part.segment.match(/^\p{Script=Latin}\p{M}*/u)[0];
          initials.push({index:part.index,length:letter.length,kind:'english'});
        }
      }
      for(const part of sentenceSegments.segment(text)) {
        const han=/\p{Script=Han}/u.exec(part.segment);
        if(han) initials.push({index:part.index+han.index,length:han[0].length,kind:'chinese'});
      }
      initials.sort((a,b)=>a.index-b.index);
      for(const {node,start,end} of nodes) {
        if(node.parentElement.closest('code,pre,button,svg')) continue;
        const marks=initials.filter(mark=>mark.index>=start && mark.index<end);
        if(!marks.length) continue;
        const fragment=document.createDocumentFragment();
        let offset=0;
        for(const mark of marks) {
          const index=mark.index-start;
          fragment.append(node.data.slice(offset,index));
          const span=document.createElement('span');
          span.className='initial-'+mark.kind;
          span.textContent=node.data.slice(index,index+mark.length);
          fragment.append(span);
          offset=index+mark.length;
        }
        fragment.append(node.data.slice(offset));
        node.replaceWith(fragment);
      }
    }
    for(const option of emphasisOptions) {
      const button=document.createElement('button');
      button.type='button';button.className='emphasis-toggle';
      button.textContent=option.label;button.title=option.title;
      button.setAttribute('aria-label',option.title);
      const apply=enabled=>{
        article.classList.toggle(option.className,enabled);
        button.setAttribute('aria-pressed',String(enabled));
      };
      apply(local.get(option.key)==='yes');
      button.onclick=()=>{
        const enabled=button.getAttribute('aria-pressed')!=='true';
        apply(enabled);local.set(option.key,enabled?'yes':'no');
      };
      voiceButton.before(button);
    }
    const toggle = document.querySelector('.toggle');
    const shelf = document.querySelector('#shelf');
    function updateToggle() {
      const collapsed = root.dataset.folded === 'yes';
      toggle.title = collapsed ? '展开书架' : '收起书架';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    function setFold(value) { root.dataset.folded=value; local.set(foldKey(),value);updateToggle(); }
    updateToggle();
    document.querySelector('#book-list').addEventListener('click', e => {
      if (compact.matches && e.target.closest('a')) setFold('yes');
    });
    toggle.addEventListener('click', () => setFold(root.dataset.folded==='yes'?'no':'yes'));
    document.addEventListener('keydown', e => {if(e.key==='Escape' && compact.matches){setFold('yes');toggle.focus();}});
    document.addEventListener('click', e => {if(compact.matches && root.dataset.folded==='no' && !shelf.contains(e.target))setFold('yes');});
    compact.addEventListener('change',()=>{applyFold();updateToggle();});
    const smaller = document.querySelector('#smaller'), larger = document.querySelector('#larger');
    function setSize(next) {
      size = Math.max(15,Math.min(27,next)); root.style.setProperty('--size',size+'px');
      local.set('size',String(size));smaller.disabled=size===15;larger.disabled=size===27;
    }
    smaller.onclick=()=>setSize(size-2); larger.onclick=()=>setSize(size+2);setSize(size);
    document.querySelector('.chapter-item[aria-current]')?.scrollIntoView({block:'nearest'});
  });
})();
