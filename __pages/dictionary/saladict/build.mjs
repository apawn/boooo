import {build} from 'esbuild';
import * as sass from 'sass';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints:[path.join(here,'entry.js')],outfile:path.join(here,'bundle.js'),
  bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'inline',
  banner:{js:'/* Uses Saladict Cambridge, Vocabulary, Bing and Youdao engines and views. MIT © 2015 CRIMX. See dictionary/saladict/LICENSE. */'},
  plugins:[{name:'reader-extension-bridge',setup(build) {
    build.onResolve({filter:/^(axios|@\/_helpers\/fetch-dom|\.\.\/helpers)$/}, () => ({path:path.join(here,'bridge.js')}));
    build.onResolve({filter:/^@\/components\/(Speaker|StrElm|StarRates|EntryBox)$/},args=>({path:args.path.split('/').pop(),namespace:'reader-components'}));
    build.onLoad({filter:/.*/,namespace:'reader-components'},args=>({contents:`export {${args.path} as default, ${args.path}, getStaticSpeaker} from './components.jsx';`,resolveDir:here,loader:'js'}));
  }}],
});
const styles=await Promise.all(['cambridge','vocabulary','bing','youdao'].map(async provider=>'.dict-'+provider+' {\n'+await readFile(path.join(here,'upstream',provider,'_style.shadow.scss'),'utf8')+'\n}'));
const css=sass.compileString(styles.join('\n'),{style:'compressed'}).css;
await writeFile(path.join(here,'bundle.css'),'/* Saladict dictionary styles, MIT © 2015 CRIMX. */\n'+css);
