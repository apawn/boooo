const button=document.querySelector('#sync-button');
const status=document.querySelector('#sync-status');
const statusButton=document.querySelector('#sync-status-button');
function showDetails(open) {details.hidden=!open;statusButton.setAttribute('aria-expanded',String(open));}
statusButton.addEventListener('click',()=>showDetails(details.hidden));
document.addEventListener('click',event=>{if(!event.target.closest('.sync-footer'))showDetails(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !details.hidden){showDetails(false);statusButton.focus();}});
const details=document.querySelector('#sync-details');
let timer,starting=false,wasRunning=false;
function render(state) {
  button.disabled=state.running || starting;
  button.classList.toggle('is-syncing',state.running);
  button.querySelector('span').textContent=state.running?'Syncing…':'Sync';
  status.textContent=state.message;
  status.dataset.phase=state.phase;
  details.replaceChildren(...(state.steps?.length?state.steps:[{message:state.message}]).map(step=>{
    const line=document.createElement('div');
    line.textContent=(step.time?new Date(step.time).toLocaleTimeString('zh-CN',{hour12:false})+' ':'')+step.message;
    return line;
  }));
  if(wasRunning && !state.running)window.dispatchEvent(new Event('bookshelf-synced'));
  wasRunning=state.running;
}
async function poll() {
  clearTimeout(timer);
  try {const response=await fetch('/git-sync',{cache:'no-store'});if(!response.ok)throw new Error('无法读取同步状态');render(await response.json());}
  catch(error){status.textContent='无法连接服务，恢复连接后会继续显示同步状态';}
  timer=setTimeout(poll,wasRunning?600:4000);
}
button.addEventListener('click',async()=>{
  if(starting || wasRunning)return;
  starting=true;button.disabled=true;status.textContent='准备同步…';
  try {
    const response=await fetch('/git-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const state=await response.json();
    if(!response.ok && response.status!==409)throw new Error(state.error || '无法开始同步');
    render(state);
  }catch(error){status.textContent=error.message;status.dataset.phase='error';}
  finally{starting=false;button.disabled=wasRunning;void poll();}
});
void poll();
