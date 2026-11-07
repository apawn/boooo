import {normalizeQuery} from './word.js';

export const providers = {
  cambridge: word => 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/' + encodeURIComponent(word.replaceAll(' ','-')),
  vocabulary: word => 'https://www.vocabulary.com/dictionary/' + encodeURIComponent(word),
  bing: word => 'https://cn.bing.com/dict/clientsearch?mkt=zh-CN&setLang=zh&form=BDVEHC&ClientVer=BDDTV3.5.1.4320&q=' + encodeURIComponent(word),
  youdao: word => 'https://dict.youdao.com/w/' + encodeURIComponent(word),
};
const pageHosts = new Set(['dictionary.cambridge.org','www.vocabulary.com','cn.bing.com','www.bing.com','dict.youdao.com']);
export function allowedMedia(value) {
  try {
    const url = new URL(value);
    if(url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    const {hostname:host,pathname:p}=url;
    if(host==='dictionary.cambridge.org') return /^\/media\/(?:english|english-chinese-simplified)\/(?:uk|us)_pron\/[-\w/]+\.mp3$/.test(p) || /^\/(?:images|external\/images)\/[-\w/.]+$/.test(p);
    if(host==='audio.vocabulary.com') return /^\/1\.0\/us\/[a-z0-9/]+\.mp3$/i.test(p);
    if(host==='sd-pronunciation-processed-videos.sdcdns.com') return /^\/desktop\/lang_en_pron_[\w]+\.mp4$/.test(p);
    if(host==='dict.youdao.com') return p==='/dictvoice';
    if(['cn.bing.com','www.bing.com','cn.bing.net','www.bing.net'].includes(host)) return /^\/dict\/audio\/[\w/.-]+\.mp3$/.test(p) || p==='/dict/mediamp3' && /^audio\/[\w/.-]+\.mp3$/.test(url.searchParams.get('blob') || '') || /^\/th$/.test(p) && /^.*\.mp3$/i.test(url.searchParams.get('id') || '');
    return false;
  } catch {return false;}
}
const cache=new Map(), pending=new Map();
async function download(url, media) {
  const hit=cache.get(url);
  if(hit && hit.expires>Date.now()) return hit;
  if(pending.has(url)) return pending.get(url);
  if(pending.size>=16) throw Object.assign(new Error('busy'),{status:429});
  const task=(async()=>{
    let target=url, response;
    const signal=AbortSignal.timeout(12000);
    for(let i=0;i<4;i++) {
      const parsed=new URL(target);
      if(media ? !allowedMedia(target) : parsed.protocol!=='https:' || !pageHosts.has(parsed.hostname) || parsed.port || parsed.username || parsed.password) throw new Error('Invalid redirect');
      response=await fetch(target,{redirect:'manual',signal});
      if(response.status>=300 && response.status<400 && response.headers.has('location')) {
        const next=new URL(response.headers.get('location'),target).href;
        await response.body?.cancel(); target=next; continue;
      }
      break;
    }
    if(!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('source unavailable'),{status:response.status===403?403:502});
    }
    const chunks=[];let size=0;
    for await(const chunk of response.body) {
      size+=chunk.length;
      if(size>(media?5:3)*1024*1024) throw new Error('Response too large');
      chunks.push(chunk);
    }
    const type=response.headers.get('content-type')?.split(';')[0] || '';
    if(media && !/^(audio\/|video\/mp4|image\/|application\/octet-stream)/.test(type)) throw new Error('Not media');
    const result={body:Buffer.concat(chunks),type:media?type:'text/html; charset=utf-8',expires:Date.now()+10*60*1000};
    // Cap total cached bytes as well as entry count.
    let bytes=[...cache.values()].reduce((sum,item)=>sum+item.body.length,0);
    while(cache.size && (cache.size>=100 || bytes+size>24*1024*1024)) {
      const key=cache.keys().next().value; bytes-=cache.get(key).body.length; cache.delete(key);
    }
    cache.set(url,result);return result;
  })();
  pending.set(url,task);
  try{return await task;}finally{pending.delete(url);}
}

export async function serveSource(requestUrl,res) {
  const media=requestUrl.pathname==='/dictionary/media';
  let target;
  if(media) {
    target=requestUrl.searchParams.get('url');
    if(!allowedMedia(target)) {res.writeHead(400).end('Unsupported recording URL');return;}
  } else {
    const provider=requestUrl.searchParams.get('provider'),word=normalizeQuery(requestUrl.searchParams.get('word'));
    if(!Object.hasOwn(providers,provider) || !word) {res.writeHead(400).end('Unsupported dictionary or word');return;}
    target=providers[provider](word);
  }
  try {
    const result=await download(target,media);
    res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'private, max-age=600',
      'Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff'}).end(result.body);
  } catch(error) {
    res.writeHead(error.status || 502,{'Content-Type':'text/plain; charset=utf-8'}).end('词典暂时无法访问，请重试或打开原站。');
  }
}
