import * as cambridge from './upstream/cambridge/engine.ts';
import * as vocabulary from './upstream/vocabulary/engine.ts';
import * as bing from './upstream/bing/engine.ts';
import * as youdao from './upstream/youdao/engine.ts';
import React from 'react';
import {createRoot} from 'react-dom/client';
import CambridgeView from './upstream/cambridge/View.tsx';
import VocabularyView from './upstream/vocabulary/View.tsx';
import BingView from './upstream/bing/View.tsx';
import YoudaoView from './upstream/youdao/View.tsx';
import {fetchDirtyDOM} from './bridge.js';
export {default as dictionaryIcons} from './icons.json';
export {createWordbook} from '../wordbook.js';
export {createRootsSection} from '../roots-view.js';

const config = {langCode:'zh-CN'};
const profile = {dicts:{all:{
  cambridge:{options:{lang:'en-chs',related:false}},
  bing:{options:{phsym:true,cdef:true,tense:true,sentence:5,related:false}},
  youdao:{options:{basic:true,collins:true,discrimination:true,sentence:true,translation:false,related:false}},
}}};
const engines={cambridge,vocabulary,bing,youdao};
const views={cambridge:CambridgeView,vocabulary:VocabularyView,bing:BingView,youdao:YoudaoView};
export function renderDictionary(container, provider, data) {
  const result = provider === 'cambridge' ? data.result.map(entry => {
    const template = document.createElement('template');
    template.innerHTML = entry.html;
    // Keep the original English definitions, examples and pronunciation controls.
    template.content.querySelectorAll('.trans, .dtrans').forEach(node => node.remove());
    return {...entry, html:template.innerHTML};
  }) : data.result;
  const root=createRoot(container);
  root.render(React.createElement(views[provider],{result}));
  return ()=>root.unmount();
}

export async function searchDictionary(provider, word) {
  const engine = engines[provider];
  const url = await engine.getSrcPage(word, config, profile);
  const data = await engine.search(word, config, profile, {isPDF:false});
  const pronunciations = [];
  if (provider === 'cambridge') {
    const document = await fetchDirtyDOM(url);
    const header = document.querySelector('.pos-header');
    for (const accent of ['uk','us']) {
      const block = header?.querySelector('.' + accent + '.dpron-i');
      const ipa = block?.querySelector('.ipa')?.textContent;
      if (ipa || data.audio?.[accent]) pronunciations.push({accent, ipa, audio:data.audio?.[accent]});
    }
  } else if(provider==='vocabulary') {
    const document = await fetchDirtyDOM(url);
    // Saladict's Vocabulary engine supplies its short/long explanations unchanged.
    // Add the site's current pronunciation metadata, absent from upstream's engine.
    for (const block of document.querySelectorAll('.ipa-with-audio')) {
      const accent = block.querySelector('.uk-flag-icon') ? 'uk' : 'us';
      const id = block.querySelector('[data-audio]')?.getAttribute('data-audio');
      const audio = block.querySelector('audio[src]')?.getAttribute('src') ||
        (id && /^[a-z0-9/]+$/i.test(id) ? 'https://audio.vocabulary.com/1.0/us/' + id + '.mp3' : undefined);
      const ipa = block.querySelector('.span-replace-h3')?.textContent.trim();
      if (audio || ipa) pronunciations.push({accent, ipa, audio});
    }
  }
  return {...data, pronunciations, url};
}
