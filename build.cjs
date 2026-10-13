// Publicar exclusivamente los archivos del cliente; excluir Apps Script y documentos.
const fs=require('node:fs');
const path=require('node:path');
const output=path.join(__dirname,'public');
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
for(const file of ['index.html','styles.css','script.js','team-progress.js','season-engine.js','config.js','logo.png','demo-season.json']) {
  fs.copyFileSync(path.join(__dirname,file),path.join(output,file));
}
console.log('SUMASUR: archivos públicos preparados.');
