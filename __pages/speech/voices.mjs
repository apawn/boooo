import { readFileSync } from 'node:fs';
const profiles=JSON.parse(readFileSync(new URL('./profiles.json',import.meta.url),'utf8'));
export const mandarinVoices = new Map(Object.entries(profiles.voices).map(([key,voice])=>
  [key,{...voice,previewText:profiles.previewText}]));
export const defaultMandarin = profiles.default;
