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
