import React from 'react';
import DOMPurify from 'dompurify';
export {getStaticSpeaker} from './bridge.js';
export function Speaker({src}) {
  return src ? <button type="button" className="dict-recording" data-dictionary-audio={src} aria-label="播放词典原声" title="播放词典原声"/> : null;
}
export function StrElm({tag:Tag='div',html,...props}) {
  return <Tag {...props} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(html,{ADD_ATTR:['target','data-dictionary-audio'],FORBID_ATTR:['style','on'],FORBID_TAGS:['script','iframe','style','form','input']})}}/>;
}
export function StarRates({rate,className}) {return <span className={className} aria-label={rate+'星'}>{'★'.repeat(Math.max(0,Math.min(5,rate)))}</span>;}
export function EntryBox({title,children}) {return <fieldset className="dict-entry-box"><legend>{title}</legend>{children}</fieldset>;}
