/* Misma lógica en navegador (ejemplo) y Apps Script (datos reales). */
const IMPACT_POINTS = Object.freeze({bajo:1,medio:2,alto:3,superalto:4});
function evaluateSeason(source, now = new Date()) {
  const fail = message => {throw new Error(message);};
  const text = x => String(x == null ? '' : x).trim();
  const person = x => text(x).toLowerCase();
  const dateOK = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
  const unique = (rows,key) => rows.every(x=>text(x[key])) && new Set(rows.map(x=>x[key])).size===rows.length;
  const s=source.season;
  if(!s||!s.id||!['preparacion','activa','cerrada'].includes(s.status))fail('Temporada inválida.');
  const teams=source.teams||[],missions=source.missions||[],impacts=source.impacts||[],goals=source.goals||[];
  const members=(source.members||[]).map(m=>({id:person(m.id),teamCode:m.teamCode}));
  if(!unique(teams,'code')||!unique(missions,'id')||!unique(members,'id')||!unique(goals,'id'))fail('Hay equipos, personas, misiones u objetivos duplicados o sin ID.');
  if(s.status!=='preparacion'&&(!dateOK(s.start)||!dateOK(s.end)||Date.parse(s.start)>=Date.parse(s.end)||!s.reward||!['puntos','resultados'].includes(s.goalType)))fail('Faltan fechas, tipo de meta o desbloqueo de la temporada.');
  if(s.goalType==='puntos'&&s.status!=='preparacion'&&(!Number.isInteger(s.target)||s.target<=0))fail('La meta de puntos debe ser un entero positivo.');
  if(s.goalType==='resultados'&&s.status!=='preparacion'&&!goals.length)fail('Faltan los objetivos concretos del desbloqueo.');
  for(const g of goals)if(!g.label||!Number.isInteger(g.target)||g.target<=0)fail('Revisar nombre y cantidad de los objetivos.');
  for(const m of missions){
    if(!m.title||!m.criterion||!['individual','equipo'].includes(m.mode)||!IMPACT_POINTS[m.minimumLevel]||!dateOK(m.start)||!dateOK(m.end)||Date.parse(m.start)>=Date.parse(m.end))fail('Revisar modalidad, criterios y fechas de las misiones.');
    if(s.status!=='preparacion'&&(Date.parse(m.start)<Date.parse(s.start)||Date.parse(m.end)>Date.parse(s.end)))fail('Una misión queda fuera de la temporada.');
    if(m.teamCode&&!teams.some(t=>t.code===m.teamCode))fail('Una misión refiere a un equipo inexistente.');
  }
  const eligible=(m,t)=>!m.teamCode||m.teamCode===t.code;
  const teamMembers=t=>members.filter(p=>p.teamCode===t.code);
  const capacity=teams.reduce((n,t)=>n+missions.filter(m=>eligible(m,t)).reduce((n,m)=>n+(m.mode==='equipo'?1:teamMembers(t).length),0),0);
  if(s.goalType==='puntos'&&s.status!=='preparacion'&&s.target>capacity*4)fail('La meta de puntos supera el máximo posible con estas misiones y participantes.');
  const slot=(m,r)=>JSON.stringify([m.id,m.mode==='individual'?person(r.personId):r.teamCode]);
  const rows=impacts.filter(r=>r.seasonId===s.id);
  if(!unique(rows,'id'))fail('Hay envíos duplicados o sin ID en la temporada.');
  // La prioridad no depende de ordenar manualmente las filas de Sheets.
  rows.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||String(a.id).localeCompare(String(b.id)));
  const completed=new Map(),reviews=new Set(),usedResults=new Set(),credited=[];
  for(const r of rows){
    const m=missions.find(m=>m.id===r.missionId),t=teams.find(t=>t.code===r.teamCode);
    if(!m||!t||!eligible(m,t)||!dateOK(r.date)||Date.parse(r.date)>+now||Date.parse(r.date)<Date.parse(m.start)||Date.parse(r.date)>Date.parse(m.end))continue;
    if(!members.some(p=>p.id===person(r.personId)&&p.teamCode===t.code))continue;
    const key=slot(m,r);
    if(['Pendiente','Revisar'].includes(r.status))reviews.add(key);
    if(r.status!=='Aprobada'||completed.has(key))continue;
    const result=person(r.resultId);
    if(!IMPACT_POINTS[r.level]||IMPACT_POINTS[r.level]<IMPACT_POINTS[m.minimumLevel]||result&&usedResults.has(result)){reviews.add(key);continue;}
    if(result)usedResults.add(result);
    const entry={...r,points:IMPACT_POINTS[r.level]};completed.set(key,entry);credited.push(entry);
  }
  const quality=Object.fromEntries(Object.keys(IMPACT_POINTS).map(k=>[k,0]));
  credited.forEach(r=>quality[r.level]++);
  const points=credited.reduce((n,r)=>n+r.points,0);
  const results=new Map(),creditedIds=new Set(credited.map(r=>r.id));
  for(const r of source.results||[]){
    const id=person(r.id);
    if(r.seasonId!==s.id||!r.validated||!id||!creditedIds.has(r.submissionId)||!goals.some(g=>g.id===r.goalId))continue;
    // Un resultado concreto cuenta una sola vez en cada objetivo.
    results.set(JSON.stringify([r.goalId,id]),r.goalId);
  }
  const goalViews=goals.map(g=>({...g,completed:[...results.values()].filter(id=>id===g.id).length}));
  const reached=goalViews.filter(g=>g.completed>=g.target).length;
  const unlocked=s.status!=='preparacion'&&(s.goalType==='puntos'?points>=s.target:goalViews.length>0&&reached===goalViews.length);
  const viewTeams=[...teams].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(t=>{
    const list=missions.filter(m=>eligible(m,t)).map(m=>{
      const subjects=m.mode==='equipo'?[t.code]:teamMembers(t).map(p=>p.id);
      const keys=subjects.map(id=>JSON.stringify([m.id,id]));
      const done=keys.map(key=>completed.get(key)).filter(Boolean);
      const reviewCount=keys.filter(key=>!completed.has(key)&&reviews.has(key)).length;
      const count=done.length,required=keys.length;
      return {id:m.id,title:m.title,mode:m.mode,completedCount:count,requiredCount:required,reviewCount,pendingCount:required-count-reviewCount,
        status:required>0&&count===required?'completed':count>0?'partial':reviewCount?'review':'pending',points:done.reduce((n,r)=>n+r.points,0),levels:[...new Set(done.map(r=>r.level))]};
    });
    return {code:t.code,name:t.name,members:teamMembers(t).length,missions:list,completed:list.reduce((n,m)=>n+m.completedCount,0),required:list.reduce((n,m)=>n+m.requiredCount,0),points:list.reduce((n,m)=>n+m.points,0)};
  });
  const active=s.status==='activa'&&Date.parse(s.start)<=+now&&+now<=Date.parse(s.end);
  const view={season:{...s,phase:s.status==='preparacion'?'preparacion':+now<Date.parse(s.start)?'proxima':s.status==='cerrada'||+now>Date.parse(s.end)?'cerrada':'activa'},missions:missions.map(m=>({...m,open:active&&m.accepting!==false&&Date.parse(m.start)<=+now&&+now<=Date.parse(m.end)})),teams:viewTeams,completed:credited.length,points,quality,capacity,goals:goalViews,goalsReached:reached,unlocked,updatedAt:now.toISOString()};
  return {view,credited}; // Solo el servidor usa credited; nunca se publica.
}
function buildSeasonView(source,now=new Date()){return evaluateSeason(source,now).view;}
if(typeof module!=='undefined')module.exports={buildSeasonView,evaluateSeason,IMPACT_POINTS};
