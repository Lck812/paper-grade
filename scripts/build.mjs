import {build} from 'esbuild';
import {cpSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const vendor = join(dist, 'vendor');
const pdf = join(root, 'node_modules', 'pdfjs-dist');
mkdirSync(vendor, {recursive:true});
for (const path of ['build/pdf.min.mjs','build/pdf.worker.min.mjs',
                    'cmaps','standard_fonts','LICENSE']) {
  cpSync(join(pdf, path), join(vendor, path.split('/').at(-1)), {recursive:true});
}

if (process.argv.includes('--static')) returnStatic();
else {
  const assets = {};
  const files = ['index.html','style.css','app.js','grade.js','import.js','pdf.js','inbox.js','student.js'];
  for (const file of files) assets['/' + file] = readFileSync(join(dist, file), 'utf8');
  for (const file of readdirSync(vendor, {recursive:true, withFileTypes:true})) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    const url = '/vendor/' + relative(vendor, path).split(sep).join('/');
    const bytes = readFileSync(path);
    assets[url] = file.name.endsWith('.mjs') || file.name.startsWith('LICENSE')
      ? bytes.toString('utf8') : {base64: bytes.toString('base64')};
  }
  await build({
    stdin:{
      contents:"import {createHandler} from './server/handler.mjs';\n" +
        'export default {fetch:createHandler(' + JSON.stringify(assets) + ')};',
      resolveDir:root,
    },
    bundle:true, format:'esm', platform:'browser', target:'es2022',
    legalComments:'inline', outfile:join(dist,'server','index.js'),
  });
  console.log('Built the Sites Worker.');
}

function returnStatic() {
  console.log('Prepared static demo and bundled PDF.js assets.');
}
