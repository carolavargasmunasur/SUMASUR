const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
let html=read('index.html').replace('<link rel="stylesheet" href="styles.css">','<style>'+read('styles.css')+'</style>');
html=html.replace('<script src="config.js"></script>','<script>window.SUMASUR_PREVIEW=true;</script><script type="application/json" id="demoData">'+read('demo-season.json').replaceAll('</','<\\/')+'</script>');
for(const file of ['season-engine.js','script.js','team-progress.js'])html=html.replace('<script src="'+file+'"></script>','<script>'+read(file)+'</script>');
html=html.replace('<a href="?">Salir del ejemplo</a>','');
fs.writeFileSync(path.join(__dirname,'SUMASUR-vista-previa.html'),html);
