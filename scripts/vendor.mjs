import { mkdir, copyFile, cp } from 'node:fs/promises';
const target = 'app/static/vendor';
await mkdir(target, { recursive: true });
for (const file of ['pdf.mjs', 'pdf.worker.mjs']) {
  await copyFile(`node_modules/pdfjs-dist/build/${file}`, `${target}/${file}`);
}
await cp('node_modules/pdfjs-dist/cmaps', `${target}/cmaps`, { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', `${target}/standard_fonts`, { recursive: true });
await copyFile('node_modules/lucide/dist/umd/lucide.min.js', `${target}/lucide.min.js`);
await copyFile('node_modules/pdfjs-dist/LICENSE', `${target}/PDFJS-LICENSE`);
await copyFile('node_modules/lucide/LICENSE', `${target}/LUCIDE-LICENSE`);
console.log('Local browser assets ready.');
