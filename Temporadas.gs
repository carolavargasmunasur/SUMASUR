const SEASON_HEADERS = {
  Temporadas:['ID','Título','Narrativa','Inicio','Cierre','Estado','Meta','Desbloqueo','Descripción desbloqueo','En web','Tipo de meta'],
  MisionesTemporada:['Temporada','ID misión','Nivel mínimo','Criterio','Inicio','Cierre','Equipo','Modalidad'],
  MetasTemporada:['Temporada','ID objetivo','Objetivo','Cantidad'],
  ResultadosTemporada:['Temporada','ID envío','ID resultado','ID objetivo','Validado']
};
function prepararTemporadas(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
  // Validar antes de escribir; se admiten columnas nuevas vacías y versiones anteriores.
  Object.keys(SEASON_HEADERS).forEach(name=>{
    const sheet=ss.getSheetByName(name);if(!sheet)return;
    const expected=SEASON_HEADERS[name],actual=sheet.getRange(1,1,1,Math.min(expected.length,sheet.getMaxColumns())).getDisplayValues()[0];
    if(actual.some((x,i)=>x&&x!==expected[i]))throw new Error('Encabezados incompatibles en '+name+'. No se modificó la configuración.');
  });
  const envios=ss.getSheetByName(SETTINGS.SHEETS.SUBMISSIONS);
  if(!envios)throw new Error('No se encuentra Envios.');
  const expected=['Notificación enviada','Temporada','Nivel de impacto','Resultado único'];
  const present=Math.max(0,Math.min(4,envios.getMaxColumns()-15));
  const actual=present?envios.getRange(1,16,1,present).getDisplayValues()[0]:[];
  if(actual.some((x,i)=>x&&x!==expected[i]))throw new Error('Las columnas P:S de Envios tienen otros datos.');
  Object.keys(SEASON_HEADERS).forEach(name=>{
    const sheet=ss.getSheetByName(name)||ss.insertSheet(name),headers=SEASON_HEADERS[name];
    if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
    sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);
  });
  if(envios.getMaxColumns()<19)envios.insertColumnsAfter(envios.getMaxColumns(),19-envios.getMaxColumns());
  envios.getRange(1,16,1,4).setValues([expected]);
}
function seasonRows_(ss,name,required){
  const sheet=ss.getSheetByName(name);
  if(!sheet)throw new Error('Falta la hoja '+name+'. Ejecutar prepararTemporadas.');
  const headers=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0];
  if(required.some(h=>!headers.includes(h)))throw new Error('Faltan columnas en '+name+'.');
  if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getValues().map((row,i)=>({...Object.fromEntries(headers.map((h,j)=>[h,row[j]])),_row:i+2})).filter(row=>headers.some(h=>row[h]!==''));
}
function seasonText_(x){return String(x==null?'':x).trim();}
function seasonDate_(x){
  if(x instanceof Date&&!isNaN(x))return x.toISOString();
  const text=seasonText_(x);if(!text)return '';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)||!Number.isFinite(Date.parse(text)))throw new Error('Usar fechas de planilla o ISO con zona horaria.');
  return new Date(text).toISOString();
}
function getSeasonSource_(ss,seasonId){
  const rows=seasonRows_(ss,'Temporadas',SEASON_HEADERS.Temporadas).filter(r=>seasonId?seasonText_(r.ID)===seasonId:seasonText_(r['En web'])==='Sí');
  if(rows.length>1)throw new Error('La temporada debe tener un ID único y solo una fila puede tener En web = Sí.');
  const raw=rows[0];
  if(!raw){if(seasonId)throw new Error('No se encuentra la temporada '+seasonId);return {season:{id:'preparacion',title:'La próxima temporada de SUMASUR.',narrative:'Estamos preparando las misiones para seguir construyendo MUNASUR entre modelo y modelo.',status:'preparacion',target:null},missions:[],teams:[],members:[],impacts:[],goals:[],results:[]};}
  const season={id:seasonText_(raw.ID),title:seasonText_(raw['Título']),narrative:seasonText_(raw.Narrativa),start:seasonDate_(raw.Inicio),end:seasonDate_(raw.Cierre),status:seasonText_(raw.Estado).toLowerCase(),target:raw.Meta===''?null:Number(raw.Meta),goalType:seasonText_(raw['Tipo de meta']).toLowerCase(),reward:seasonText_(raw.Desbloqueo),rewardDescription:seasonText_(raw['Descripción desbloqueo'])};
  const catalog=seasonRows_(ss,SETTINGS.SHEETS.MISSIONS,['ID misión','Título','Descripción','Estado','Visible en web']);
  const missions=seasonRows_(ss,'MisionesTemporada',SEASON_HEADERS.MisionesTemporada).filter(r=>seasonText_(r.Temporada)===season.id).map(r=>{
    const id=seasonText_(r['ID misión']),matches=catalog.filter(m=>seasonText_(m['ID misión'])===id);
    if(matches.length!==1)throw new Error('La misión '+id+' debe tener un ID único en Misiones.');
    const m=matches[0];return {id,title:seasonText_(m['Título']),description:seasonText_(m['Descripción']),minimumLevel:seasonText_(r['Nivel mínimo']).toLowerCase(),mode:seasonText_(r.Modalidad).toLowerCase(),criterion:seasonText_(r.Criterio),start:seasonDate_(r.Inicio),end:seasonDate_(r.Cierre),teamCode:seasonText_(r.Equipo),accepting:seasonText_(m.Estado)==='Activa'&&seasonText_(m['Visible en web'])==='Sí'};
  });
  const teams=seasonRows_(ss,SETTINGS.SHEETS.TEAMS,['Código','Nombre visible','Activo']).filter(r=>seasonText_(r.Activo)==='Sí').map(r=>({code:seasonText_(r['Código']),name:seasonText_(r['Nombre visible'])}));
  const members=seasonRows_(ss,SETTINGS.SHEETS.REGISTRATIONS,['Mail MUNASUR','Código equipo','Activo']).filter(r=>seasonText_(r.Activo)==='Sí').map(r=>({id:seasonText_(r['Mail MUNASUR']).toLowerCase(),teamCode:seasonText_(r['Código equipo'])}));
  const impacts=seasonRows_(ss,SETTINGS.SHEETS.SUBMISSIONS,['ID envío','Fecha','Mail MUNASUR','Código equipo','ID misión','Estado','Temporada','Nivel de impacto','Resultado único']).filter(r=>seasonText_(r.Temporada)===season.id).map(r=>({id:seasonText_(r['ID envío']),row:r._row,seasonId:seasonText_(r.Temporada),missionId:seasonText_(r['ID misión']),teamCode:seasonText_(r['Código equipo']),personId:seasonText_(r['Mail MUNASUR']).toLowerCase(),date:seasonDate_(r.Fecha),status:seasonText_(r.Estado),level:seasonText_(r['Nivel de impacto']).toLowerCase(),resultId:seasonText_(r['Resultado único'])}));
  const goals=seasonRows_(ss,'MetasTemporada',SEASON_HEADERS.MetasTemporada).filter(r=>seasonText_(r.Temporada)===season.id).map(r=>({id:seasonText_(r['ID objetivo']),label:seasonText_(r.Objetivo),target:Number(r.Cantidad)}));
  const results=seasonRows_(ss,'ResultadosTemporada',SEASON_HEADERS.ResultadosTemporada).filter(r=>seasonText_(r.Temporada)===season.id).map(r=>({seasonId:seasonText_(r.Temporada),submissionId:seasonText_(r['ID envío']),id:seasonText_(r['ID resultado']),goalId:seasonText_(r['ID objetivo']),validated:seasonText_(r.Validado)==='Sí'}));
  return {season,missions,teams,members,impacts,goals,results};
}
function getSeasonView_(){return buildSeasonView(getSeasonSource_(SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID)));}
function validateSeasonSubmission_(ss,body,registration){
  const source=getSeasonSource_(ss),view=buildSeasonView(source);
  if(seasonText_(body.seasonId)!==source.season.id)throw new Error('Actualizá la página y elegí una misión de la temporada vigente.');
  const m=view.missions.find(m=>m.id===seasonText_(body.missionId));
  if(!m||!m.open)throw new Error('Esta misión no está recibiendo evidencias.');
  const team=seasonText_(registration['Código equipo']),person=seasonText_(registration['Mail MUNASUR']).toLowerCase();
  if(!view.teams.some(t=>t.code===team)||m.teamCode&&m.teamCode!==team)throw new Error('La misión no está asignada a tu equipo.');
  if(!source.members.some(p=>p.id===person&&p.teamCode===team))throw new Error('El registro del voluntario no está activo.');
  const prior=source.impacts.filter(r=>r.missionId===m.id&&(m.mode==='individual'?r.personId===person:r.teamCode===team));
  if(prior.some(r=>r.status==='Aprobada'))throw new Error(m.mode==='individual'?'Ya tenés un envío aprobado para esta misión. No vuelve a sumar.':'Tu equipo ya tiene un envío aprobado para esta misión. No vuelve a sumar.');
  if(prior.some(r=>['Pendiente','Revisar'].includes(r.status)))throw new Error('Ya hay un envío en revisión. Esperá la devolución antes de volver a enviarlo.');
  return source.season.id;
}
// Serializa comprobación + escritura: dos clics simultáneos no crean dos envíos.
function submitSeasonLocked_(body){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return createSubmission_(body);}finally{lock.releaseLock();}
}
function sincronizarPuntosTemporadas(){
  const ss=SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID),lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return syncSeasonPoints_(ss);}finally{lock.releaseLock();}
}
function syncSeasonPoints_(ss){
  const records=seasonRows_(ss,SETTINGS.SHEETS.SUBMISSIONS,['ID envío','Temporada','Puntos otorgados']);
  const visible=seasonRows_(ss,'Temporadas',SEASON_HEADERS.Temporadas).filter(r=>seasonText_(r['En web'])==='Sí').map(r=>seasonText_(r.ID));
  if(visible.length>1)throw new Error('Solo una temporada puede tener En web = Sí.');
  const ids=[...new Set(records.map(r=>seasonText_(r.Temporada)).filter(id=>visible.includes(id)))],updates=[];
  // Calcular todo antes de escribir. Nunca tocar los puntos anteriores a las temporadas.
  for(const id of ids){
    const source=getSeasonSource_(ss,id),evaluation=evaluateSeason(source),scores=new Map(evaluation.credited.map(r=>[r.id,r.points]));
    source.impacts.forEach(r=>updates.push({row:r.row,points:scores.get(r.id)||0}));
  }
  const sheet=ss.getSheetByName(SETTINGS.SHEETS.SUBMISSIONS);
  updates.forEach(r=>sheet.getRange(r.row,11).setValue(r.points));
  return updates.length;
}
// Disparador simple en el proyecto vinculado a Sheets. No envía correos.
function onEdit(e){
  if(!e||!e.range||e.range.getRow()===1)return;
  const name=e.range.getSheet().getName();
  if(!['Envios','Registros','Equipos','Misiones','Temporadas','MisionesTemporada','MetasTemporada','ResultadosTemporada'].includes(name))return;
  const ss=e.source;if(!ss.getSheetByName('Temporadas'))return;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{syncSeasonPoints_(ss);}catch(error){ss.toast(error.message,'Revisar configuración SUMASUR',10);throw error;}finally{lock.releaseLock();}
}
