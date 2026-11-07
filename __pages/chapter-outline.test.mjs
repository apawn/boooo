import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {chapterOutline, headingLabels} from './chapter-outline.mjs';

test('outline anchors match rendered headings, skip code and chapter title, and distinguish duplicates',()=>{
  const md=new MarkdownIt().use(chapterOutline);
  const env={};
  const html=md.render('# Chapter\n\n## **A title** · 标题\n\n### [Nested](https://example.com)\n\n## **A title** · 标题\n\n```\n## Not a heading\n```',env);
  assert.deepEqual(env.headings,[
    {id:'section-1',text:'A title · 标题',level:2},
    {id:'section-2',text:'Nested',level:3},
    {id:'section-3',text:'A title · 标题',level:2},
  ]);
  for(const h of env.headings)assert.ok(html.includes(`<h${h.level} id="${h.id}">`));
  const next={};md.render('## Other chapter',next);
  assert.equal(next.headings[0].id,'section-1');
});

test('bilingual subtitles use Chinese first without altering monolingual titles',()=>{
  assert.deepEqual(headingLabels('The Founding Of Buenos Aires · 建立布宜诺斯艾利斯'),['建立布宜诺斯艾利斯','The Founding Of Buenos Aires']);
  assert.deepEqual(headingLabels('English title'),['English title','']);
  assert.deepEqual(headingLabels('本章插图'),['本章插图','']);
});
