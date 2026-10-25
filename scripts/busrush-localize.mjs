import {readFileSync,writeFileSync} from 'node:fs';
const path='public/busrush-test/index.html';
const catalog=readFileSync('public/busrush-test/locale-en.js','utf8').trim();
if(catalog.includes('</script'))throw Error('Unsafe catalog terminator');
let html=readFileSync(path,'utf8');
const embedded='<script id="busrush-english-catalog">\n'+catalog+'\n</script>';
if(html.includes('<script id="busrush-english-catalog">'))html=html.replace(/<script id="busrush-english-catalog">[\s\S]*?<\/script>/,()=>embedded);
else{const at=html.lastIndexOf('<script>',html.indexOf('const RushLocale='));if(at<0)throw Error('Game script missing');html=html.slice(0,at)+embedded+html.slice(at);}
writeFileSync(path,html);
console.log('English catalog embedded; no deployment or gameplay changes.');
