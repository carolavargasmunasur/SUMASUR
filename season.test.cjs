const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildSeasonView,evaluateSeason,IMPACT_POINTS}=require('../season-engine');
const fixture=()=>JSON.parse(fs.readFileSync(require.resolve('../demo-season.json'),'utf8'));
const now=new Date('2026-11-12T18:00:00Z');
test('niveles fijos 1,2,3,4; solo aprobaciones de esta temporada',()=>{
 assert.deepEqual(IMPACT_POINTS,{bajo:1,medio:2,alto:3,superalto:4});const s=fixture();s.impacts.push({...s.impacts[0],id:'old',seasonId:'OLD'});
 const v=buildSeasonView(s,now);assert.equal(v.points,11);assert.equal(v.completed,5);assert.equal(v.quality.medio,4);assert.equal(v.unlocked,false);
});
test('individual: dos personas del mismo equipo suman; la misma persona no repite',()=>{
 const s=fixture();s.impacts.push({...s.impacts[0],id:'repeat',resultId:'other'});const v=buildSeasonView(s,now),n=v.teams.find(t=>t.code==='NORTE');assert.equal(n.points,4);assert.equal(n.missions[0].completedCount,2);assert.equal(n.missions[0].status,'completed');assert.equal(v.points,11);
});
test('grupal: diferentes integrantes no pueden sumar dos veces',()=>{
 const s=fixture();s.impacts.push({...s.impacts[3],id:'repeat',personId:'este2@example.org',resultId:'other'});assert.equal(buildSeasonView(s,now).points,11);
});
test('individual parcial informa cantidad sin exponer identidades',()=>{
 const v=buildSeasonView(fixture(),now),t=v.teams.find(t=>t.code==='SUR');assert.equal(t.missions[0].status,'partial');assert.equal(t.missions[0].completedCount,1);assert.equal(t.missions[0].requiredCount,2);assert.ok(!JSON.stringify(v).includes('@example.org'));
});
test('pendiente, rechazado, calidad insuficiente no dan puntos; reenviar rechazado sí',()=>{
 for(const change of [{status:'Pendiente'},{status:'Rechazada'},{level:'bajo'},{level:''}]){const s=fixture();Object.assign(s.impacts[0],change);assert.equal(buildSeasonView(s,now).points,9);}
 const s=fixture();s.impacts[0].status='Rechazada';s.impacts.push({...s.impacts[0],id:'correccion',status:'Aprobada'});assert.equal(buildSeasonView(s,now).points,11);
});
test('un mismo resultado opcional no se acredita a dos participantes',()=>{const s=fixture();s.impacts[1].resultId=s.impacts[0].resultId;assert.equal(buildSeasonView(s,now).points,9);});
test('los puntos no requieren cargar un resultado concreto aparte',()=>{const s=fixture();s.impacts.forEach(r=>r.resultId='');assert.equal(buildSeasonView(s,now).points,11);});
test('meta por puntos: alcanzar y revocar',()=>{const s=fixture();s.season.target=11;assert.equal(buildSeasonView(s,now).unlocked,true);s.impacts[0].status='Rechazada';assert.equal(buildSeasonView(s,now).unlocked,false);});
test('meta por resultados no se desbloquea solo por tener puntos',()=>{const s=fixture();s.season.goalType='resultados';s.season.target=1;const v=buildSeasonView(s,now);assert.equal(v.unlocked,false);assert.equal(v.goals[0].completed,1);assert.equal(v.goalsReached,0);});
test('objetivos concretos requieren validación, envío aprobado y todos los umbrales',()=>{
 const s=fixture();s.season.goalType='resultados';s.results.push({...s.results[0],id:'second'}, {...s.results[0],id:'opportunity',goalId:'OPORTUNIDAD'});
 assert.equal(buildSeasonView(s,now).unlocked,true);s.results[2].validated=false;assert.equal(buildSeasonView(s,now).unlocked,false);s.results[2].validated=true;s.impacts[3].status='Rechazada';assert.equal(buildSeasonView(s,now).goals[0].completed,0);
});
test('duplicar fila de resultado o asociarla a un envío duplicado no infla la meta',()=>{const s=fixture();s.results.push({...s.results[0]},{...s.results[0],id:'pending',submissionId:'DEMO-ENV-5'});assert.equal(buildSeasonView(s,now).goals[0].completed,1);});
test('cierres bloquean recepción, preservan impacto; no cuentan registros futuros ni fuera de plazo',()=>{
 const s=fixture();let v=buildSeasonView(s,new Date('2026-12-01T00:00:00Z'));assert.equal(v.points,11);assert.ok(v.missions.every(m=>!m.open));s.impacts[0].date='2026-11-08T12:00:00Z';assert.equal(buildSeasonView(s,now).points,9);assert.equal(buildSeasonView(s,new Date('2026-11-09T12:00:00Z')).points,0);
});
test('configuraciones imposibles y modalidades desconocidas fallan explícitamente',()=>{
 const s=fixture();s.season.target=1000;assert.throws(()=>buildSeasonView(s,now),/máximo posible/);s.season.target=20;s.missions[0].mode='otra';assert.throws(()=>buildSeasonView(s,now),/modalidad/);s.missions[0].mode='individual';s.missions.push({...s.missions[0]});assert.throws(()=>buildSeasonView(s,now),/duplicados/);
});
test('ordenar las filas no cambia qué envío duplicado se acredita',()=>{const s=fixture();s.impacts.push({...s.impacts[0],id:'Z-LATE',date:'2026-11-12T12:00:00Z',level:'superalto',resultId:'new'});const a=evaluateSeason(s,now);s.impacts.reverse();const b=evaluateSeason(s,now);assert.equal(a.view.points,b.view.points);assert.deepEqual(a.credited.map(r=>r.id),b.credited.map(r=>r.id));});
function backend(){const c=vm.createContext({console,Date});for(const f of ['SeasonEngine.gs','Temporadas.gs','Code.gs'])new vm.Script(fs.readFileSync(require.resolve('../apps-script/'+f),'utf8'),{filename:f}).runInContext(c);return c;}
function activeFixture(){const s=fixture();s.season.start='2020-01-01T00:00:00Z';s.season.end='2099-01-01T00:00:00Z';s.missions.forEach(m=>{m.start=s.season.start;m.end=s.season.end;m.accepting=true});return s;}
test('servidor aplica modalidad, duplicados y reenvío antes de guardar archivo',()=>{
 const c=backend(),s=activeFixture();c.getSeasonSource_=()=>s;const body={seasonId:s.season.id,missionId:'DEMO-1'},reg={'Código equipo':'SUR','Mail MUNASUR':'sur2@example.org'};
 assert.equal(c.validateSeasonSubmission_({},body,reg),s.season.id);assert.throws(()=>c.validateSeasonSubmission_({},body,{...reg,'Mail MUNASUR':'sur1@example.org'}),/aprobado/);
 assert.throws(()=>c.validateSeasonSubmission_({},{...body,missionId:'DEMO-2'},reg),/revisión/);
 s.impacts[4].status='Rechazada';assert.equal(c.validateSeasonSubmission_({},{...body,missionId:'DEMO-2'},reg),s.season.id);
 assert.throws(()=>c.validateSeasonSubmission_({},{...body,seasonId:'OLD'},reg),/temporada/);s.season.status='cerrada';assert.throws(()=>c.validateSeasonSubmission_({},body,reg),/recibiendo/);
});
test('servidor rechaza equipo equivocado y persona no registrada',()=>{
 const c=backend(),s=activeFixture();c.getSeasonSource_=()=>s;const body={seasonId:s.season.id,missionId:'DEMO-3'},reg={'Código equipo':'SUR','Mail MUNASUR':'sur2@example.org'};
 s.missions[2].teamCode='NORTE';assert.throws(()=>c.validateSeasonSubmission_({},body,reg),/equipo/);s.missions[2].teamCode='';assert.throws(()=>c.validateSeasonSubmission_({},body,{...reg,'Mail MUNASUR':'otra@example.org'}),/registro/);
});
test('bloqueo cubre comprobación y escritura y siempre se libera',()=>{
 const c=backend(),events=[];c.LockService={getScriptLock:()=>({waitLock:()=>events.push('lock'),releaseLock:()=>events.push('unlock')})};c.createSubmission_=()=>{events.push('write');return {ok:true}};c.submitSeasonLocked_({});assert.deepEqual(events,['lock','write','unlock']);c.createSubmission_=()=>{throw Error('fallo')};assert.throws(()=>c.submitSeasonLocked_({}),/fallo/);assert.equal(events.at(-1),'unlock');
});
test('sincroniza K de temporadas y conserva filas históricas',()=>{
 const c=backend(),s=activeFixture();s.impacts.forEach((r,i)=>{r.date='2026-01-01T12:00:00Z';r.row=i+3});const writes=[];c.seasonRows_=(_,name)=>name==='Temporadas'?[{ID:s.season.id,'En web':'Sí'}]:[{Temporada:'',_row:2},{Temporada:s.season.id,_row:3},{Temporada:'ARCHIVADA',_row:90}];c.getSeasonSource_=()=>s;
 c.syncSeasonPoints_({getSheetByName:()=>({getRange:(row,col)=>({setValue:value=>writes.push({row,col,value})})})});assert.equal(writes.length,6);assert.ok(writes.every(r=>r.col===11&&r.row>2));assert.equal(writes.reduce((n,r)=>n+r.value,0),11);assert.equal(writes.find(r=>r.row===7).value,0);
});
