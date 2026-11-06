// Web-page equivalents of the small helper surface used by Saladict's engines.
import DOMPurify from 'dompurify';

const documents = new Map();
export async function fetchDirtyDOM(url) {
  if (documents.has(url)) return (await documents.get(url)).cloneNode(true);
  const source = new URL(url);
  const provider = {'dictionary.cambridge.org':'cambridge','www.vocabulary.com':'vocabulary','cn.bing.com':'bing','dict.youdao.com':'youdao'}[source.hostname];
  if (!provider) throw new Error('Unsupported dictionary');
  const word = source.searchParams.get('q') || decodeURIComponent(source.pathname.replace(/\/$/,'').split('/').pop());
  const promise = (async () => {
    const response = await fetch('/dictionary/source?' + new URLSearchParams({provider, word}), {signal:AbortSignal.timeout(15000)});
    if (!response.ok) {
      const error = new Error('NETWORK_ERROR');
      error.response = {status:response.status};
      throw error;
    }
    const html = await response.text();
    // Do not execute page scripts, event handlers, trackers or embeds.
    // Bing embeds its recording URL in onclick. Preserve only that URL as data,
    // then discard every event handler; no code from the dictionary is executed.
    const prepared = html.replace(/onclick=(['"])(.*?)\1/gi, (attribute, quote, value) => {
      const mp3 = value.match(/((?:https?:)?\/\/[^'"\s)]+\.mp3(?:\?[^'"\s)]*)?|\/[^'"\s)]+\.mp3)/);
      return provider === 'bing' && mp3 ? 'data-pronunciation="' + mp3[1].replaceAll('&','&amp;') + '"' : '';
    });
    const clean = DOMPurify.sanitize(prepared, {WHOLE_DOCUMENT:true, ADD_TAGS:['amp-audio','amp-img'], ADD_ATTR:['src','type'], FORBID_TAGS:['script','iframe','style','link','form','input']});
    return new DOMParser().parseFromString(clean, 'text/html');
  })();
  if (documents.size >= 60) documents.delete(documents.keys().next().value);
  documents.set(url, promise);
  try { return (await promise).cloneNode(true); }
  catch (error) { documents.delete(url); throw error; }
}

export function getText(parent, ...args) {
  const selector=args.find(arg=>typeof arg==='string');
  const transform=args.find(arg=>typeof arg==='function');
  const text=(selector ? parent?.querySelector(selector) : parent)?.textContent || '';
  return transform ? transform(text) : text;
}
export function removeChild(parent, selector) { parent.querySelectorAll(selector).forEach(node => node.remove()); }
export function getFullLink(host, node, attribute) {
  try { const url = new URL(node.getAttribute(attribute) || '', host); if(url.protocol==='http:') url.protocol='https:'; return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
export function externalLink(link) { link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
export function getInnerHTML(host, parent, options = {}) {
  if(typeof options==='string') options={selector:options};
  const node=options.selector ? parent.querySelector(options.selector) : parent;
  if(!node) return '';
  // Account-only controls cannot work outside the dictionary website.
  node.querySelectorAll('.wordlist-add-button').forEach(button=>button.remove());
  for (const link of node.querySelectorAll('a[href]')) {
    const href = getFullLink(host, link, 'href');
    if (href) link.href = href;
    else link.removeAttribute('href');
    externalLink(link);
  }
  for (const image of node.querySelectorAll('img')) if (!image.src.startsWith('data:image/')) image.remove();
  const html=DOMPurify.sanitize(node.innerHTML, {ADD_ATTR:['target','data-dictionary-audio'],FORBID_ATTR:['style','on'],FORBID_TAGS:['script','iframe','style','form','input','audio','video']});
  return options.transform ? options.transform(html) : html;
}
export function getStaticSpeaker(url) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'dict-recording';
  button.dataset.dictionaryAudio = url;
  button.title = '播放词典原声';
  button.setAttribute('aria-label','播放词典原声');
  return button;
}
export const handleNoResult = () => Promise.reject(new Error('NO_RESULT'));
export const handleNetWorkError = () => Promise.reject(new Error('NETWORK_ERROR'));
export const handleManualVerification = info => Promise.reject(Object.assign(new Error('MANUAL_VERIFICATION'), {manualVerification:info}));
// The reader only uses simplified Chinese. The upstream traditional-only branch is unused.
export const getChsToChz = async lang => {
  if(lang==='zh-CN') return null;
  throw new Error('Traditional dictionary is not configured');
};

// Cambridge's upstream engine uses axios only for its optional illustrations.
export default {async get(url) {
  const response = await fetch('/dictionary/media?' + new URLSearchParams({url}), {signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('image');
  return {data:await response.arrayBuffer(),headers:{'content-type':response.headers.get('content-type')}};
}};
