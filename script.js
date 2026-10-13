'use strict';
const $ = selector => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const labels = {bajo:'Bajo',medio:'Medio',alto:'Alto',superalto:'Super alto'};
const state = {view:null,filter:'all',demo:Boolean(window.SUMASUR_PREVIEW)||new URLSearchParams(location.search).get('demo')==='1',loading:false,sending:false};
const dateLabel = value => new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value));
const dateTimeLabel = value => new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value));
async function api(action,payload=null) {
  const url = window.MUNASUR_CONFIG?.API_URL;
  if (!url) throw new Error('La conexión no está configurada.');
  const endpoint = payload ? url : `${url}?action=${encodeURIComponent(action)}&_=${Date.now()}`;
  const response = await fetch(endpoint,{method:payload?'POST':'GET',cache:'no-store',...(payload?{headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload})}:{signal:AbortSignal.timeout(25000)})});
  if (!response.ok) throw new Error('No se pudo conectar.');
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
function validView(v) {
  return v && v.season && ['preparacion','activa','cerrada','proxima'].includes(v.season.phase) && Array.isArray(v.missions) && Array.isArray(v.teams) && Number.isInteger(v.points) && v.points>=0 && v.quality && Array.isArray(v.goals) && v.teams.every(t=>typeof t.code==='string'&&typeof t.name==='string'&&Array.isArray(t.missions)&&t.missions.every(m=>['pending','review','partial','completed'].includes(m.status))) && v.missions.every(m=>typeof m.id==='string'&&typeof m.title==='string'&&labels[m.minimumLevel]&&['individual','equipo'].includes(m.mode)&&Number.isFinite(Date.parse(m.end))) && typeof v.unlocked==='boolean';
}
function renderSeason() {
  const v=state.view,s=v.season,results=s.goalType==='resultados';
  $('#seasonStatus').textContent = {preparacion:'En preparación',proxima:'Próximamente',activa:'Temporada en curso',cerrada:'Temporada cerrada'}[s.phase];
  $('#seasonTitle').textContent=s.title||'La próxima temporada de SUMASUR.';
  $('#seasonNarrative').textContent=s.narrative||'Estamos preparando las misiones para seguir construyendo MUNASUR entre modelo y modelo.';
  $('#seasonDates').textContent=s.start&&s.end?`${dateLabel(s.start)} — ${dateLabel(s.end)} · HORA ARGENTINA`:'PRÓXIMA TEMPORADA';
  const hasTarget=results?v.goals.length>0:Number.isInteger(s.target)&&s.target>0;
  const current=results?v.goalsReached:v.points,target=results?v.goals.length:s.target;
  $('#progressLabel').textContent=hasTarget?(results?'Objetivos concretos alcanzados':'Puntos de impacto de todos los equipos'):'Meta por anunciar';
  $('#progressNumber').textContent=hasTarget?`${current} / ${target}`:'—';
  const meter=$('#collectiveMeter');meter.hidden=!hasTarget;meter.max=target||1;meter.value=current;
  $('#goalList').innerHTML=results?v.goals.map(g=>`<div class="goal-row"><div><span>${escapeHtml(g.label)}</span><b>${g.completed} / ${g.target}</b></div><progress value="${g.completed}" max="${g.target}" aria-label="${escapeHtml(g.label)}"></progress></div>`).join(''):'';
  $('#progressCaption').textContent=hasTarget?(v.unlocked?'¡Objetivo alcanzado! Este desbloqueo lo conseguimos entre todos.':results?'El desbloqueo se alcanza cuando completamos todos estos objetivos. Los resultados deben estar validados por coordinación.':`Nos faltan ${Math.max(0,target-current)} puntos de impacto para alcanzar la meta de MUNASUR.`):'La coordinación publicará la meta y el desbloqueo antes de abrir las misiones.';
  $('#seasonImpact').textContent=hasTarget?`${v.points} puntos de impacto · ${v.completed} aportes aprobados en esta temporada`:'';
  $('#rewardTitle').textContent=s.reward||'Desbloqueo por anunciar.';
  $('#rewardDescription').textContent=s.rewardDescription||'Con el lanzamiento vamos a conocer qué conseguiremos al alcanzar la meta.';
  $('#unlockLabel').textContent=v.unlocked?'LO CONSEGUIMOS':'EL DESBLOQUEO DE ESTA TEMPORADA';
  $('#unlockIcon').textContent=v.unlocked?'✓':'↗';
  $('#unlockFooter').textContent=v.unlocked?'Desbloqueado · Coordinación comunicará cómo se realiza.':'Lo alcanzamos entre todos los equipos.';
  $('#seasonUpdate').textContent='Consultado '+dateTimeLabel(v.updatedAt);
  renderMissions();renderRecognitions();
  document.dispatchEvent(new CustomEvent('sumasur:season-loaded'));
}
function renderMissions() {
  const all=state.view?.missions||[];
  const list=all.filter(m=>state.filter==='all'||state.filter==='open'&&m.open||state.filter==='alto'&&['alto','superalto'].includes(m.minimumLevel));
  $('#missions').innerHTML=list.length?list.map((m,i)=>`<article class="mission-card"><div class="mission-top"><span class="mission-index">MISIÓN / ${String(i+1).padStart(2,'0')}</span><span class="tag">DESDE ${IMPACT_POINTS[m.minimumLevel]} PUNTOS</span></div><h3>${escapeHtml(m.title)}</h3><p class="mission-mode">${m.mode==='individual'?'INDIVIDUAL <span>· una vez por voluntario</span>':'POR EQUIPO <span>· una vez entre todos</span>'}</p><p>${escapeHtml(m.description)}</p><div class="criterion"><strong>PARA APROBARLA · IMPACTO ${escapeHtml(labels[m.minimumLevel]).toUpperCase()} O SUPERIOR</strong>${escapeHtml(m.criterion)}</div>${m.teamCode?`<p class="small">Para el equipo ${escapeHtml(state.view.teams.find(t=>t.code===m.teamCode)?.name||m.teamCode)}</p>`:''}<button class="button js-mission" data-id="${escapeHtml(m.id)}" ${m.open&&!state.demo?'':'disabled'}>${state.demo?'Ejemplo · envío desactivado':m.open?'Cargar evidencia ↗':Date.now()<Date.parse(m.start)?'Abre '+escapeHtml(dateLabel(m.start)):'Recepción cerrada'}</button><span class="mission-date">${escapeHtml(dateTimeLabel(m.start))} → ${escapeHtml(dateTimeLabel(m.end))}</span></article>`).join(''):`<p class="empty">${all.length?'No hay misiones con este filtro.':'Las misiones aparecerán acá cuando coordinación publique la temporada. Cada una tendrá modalidad, plazo y criterios de aprobación.'}</p>`;
  const available=all.filter(m=>m.open);
  $('#missionSelect').replaceChildren(new Option('Elegí una misión',''),...available.map(m=>new Option(m.title+' · '+(m.mode==='individual'?'individual':'por equipo'),m.id)));
  $('#openSubmitTop').disabled=!available.length||state.demo;
}
function renderRecognitions(){
  const v=state.view;
  if(!v.completed){$('#recognitions').innerHTML='<p class="empty">Acá vamos a reconocer los aportes aprobados y a los equipos que los hicieron posibles.</p>';return;}
  const descriptions={bajo:'Más personas conocen MUNASUR.',medio:'Más personas se interesan en participar.',alto:'Nos acercamos a nuevas instituciones.',superalto:'Conseguimos oportunidades para MUNASUR.'};
  $('#recognitions').innerHTML=Object.keys(labels).map(k=>`<article class="recognition"><span>IMPACTO ${labels[k].toUpperCase()}</span><strong>${Number(v.quality[k]||0)}</strong><span>aportes aprobados · ${IMPACT_POINTS[k]} ${IMPACT_POINTS[k]===1?'punto':'puntos'} cada uno</span><p>${descriptions[k]}</p><p>${v.teams.filter(t=>t.missions.some(m=>m.levels.includes(k))).map(t=>escapeHtml(t.name)).join(' · ')}</p></article>`).join('');
}
async function loadPage(){
  if(state.loading||state.sending)return;state.loading=true;$('#refreshProgress').disabled=true;
  const message=$('#connectionMessage');message.hidden=true;
  try{
    let view;
    if(state.demo){let raw;const embedded=$('#demoData');if(embedded){raw=JSON.parse(embedded.textContent);}else{const response=await fetch('demo-season.json');if(!response.ok)throw new Error('Ejemplo no disponible.');raw=await response.json();}raw.season.goalType=$('#demoGoalType')?.value||'puntos';view=buildSeasonView(raw,new Date('2026-11-12T15:00:00-03:00'));$('#demoBanner').hidden=false;}
    else {view=(await api('season')).view;}
    if(!validView(view))throw new Error('Los datos de la temporada están incompletos.');
    state.view=view;renderSeason();
  }catch(error){
    state.view=null;$('#seasonStatus').textContent='Información no disponible';$('#openSubmitTop').disabled=true;
    $('#missions').innerHTML='<p class="empty">No pudimos consultar las misiones. Volvé a intentar en unos minutos.</p>';
    $('#seasonUpdate').textContent='Sin datos actualizados';$('#progressNumber').textContent='—';$('#collectiveMeter').hidden=true;
    $('#goalList').replaceChildren();$('#seasonImpact').textContent='';$('#progressLabel').textContent='Progreso no disponible';$('#progressCaption').textContent='Volvé a consultar para ver el avance validado.';
    $('#unlockLabel').textContent='PENDIENTE DE CONSULTA';$('#unlockIcon').textContent='↗';$('#unlockFooter').textContent='No se pudo verificar el desbloqueo.';
    $('#recognitions').innerHTML='<p class="empty">Los reconocimientos no están disponibles en este momento.</p>';
    message.hidden=false;message.textContent='No pudimos consultar la temporada. ';
    const retry=document.createElement('button');retry.className='text-button';retry.textContent='Volver a intentar';retry.onclick=loadPage;message.append(retry);
    document.dispatchEvent(new CustomEvent('sumasur:season-loaded'));
  }finally{state.loading=false;$('#refreshProgress').disabled=false;}
}
function openDialog(id=''){
  if(state.demo||!state.view?.missions.some(m=>m.open))return;
  $('#missionSelect').value=id;renderMissionHelp();$('#formMessage').textContent='';$('#submitDialog').showModal();
}
function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file);});}
$('#submissionForm').addEventListener('submit',async event=>{
  event.preventDefault();if(state.sending||state.demo)return;
  const message=$('#formMessage'),file=$('#evidence').files[0],button=$('#submitButton');
  message.className='form-message error';
  if(!file||file.size>8*1024*1024){message.textContent='Adjuntá un archivo de hasta 8 MB.';return;}
  const m=state.view?.missions.find(m=>m.id===$('#missionSelect').value);
  if(!m?.open||Date.now()>Date.parse(m.end)){message.textContent='Esta misión ya no está recibiendo evidencias. Actualizá la temporada.';return;}
  state.sending=true;button.disabled=true;$('#closeDialog').disabled=true;button.textContent='Enviando…';message.textContent='';
  try{
    await api('submit',{seasonId:state.view.season.id,email:$('#email').value.trim().toLowerCase(),missionId:m.id,comment:$('#comment').value.trim(),fileName:file.name,mimeType:file.type||'application/octet-stream',fileBase64:await fileToBase64(file)});
    event.target.reset();message.className='form-message success';message.textContent='¡Aporte recibido! Quedó pendiente de revisión. Todavía no suma al progreso.';
    document.dispatchEvent(new CustomEvent('sumasur:submission-sent'));
  }catch(error){message.textContent=error.message+' Si se cortó la conexión, consultá a coordinación antes de reenviar.';}
  finally{state.sending=false;button.disabled=false;$('#closeDialog').disabled=false;button.textContent='Enviar para revisión';}
});
$('#submitDialog').addEventListener('cancel',e=>{if(state.sending)e.preventDefault();});
$('#closeDialog').addEventListener('click',()=>$('#submitDialog').close());
$('#openSubmitTop').addEventListener('click',()=>openDialog());
$('#missions').addEventListener('click',e=>{const b=e.target.closest('.js-mission');if(b&&!b.disabled)openDialog(b.dataset.id);});
$('.filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',String(el===b));});renderMissions();});
$('#refreshProgress').addEventListener('click',loadPage);
$('#loadHistory').addEventListener('click',async()=>{
  const button=$('#loadHistory');button.disabled=true;
  try{if(state.demo){$('#rankingList').textContent='El ejemplo no muestra datos reales del historial.';return;}
    const data=await api('bootstrap');
    $('#rankingList').innerHTML=data.ranking?.length?data.ranking.map((r,i)=>`<div class="rank-row"><span>${i+1}.</span><b>${escapeHtml(r.team)}</b><span>${Number(r.points||0)} pts históricos</span></div>`).join(''):'Todavía no hay un historial disponible.';
  }catch{$('#rankingList').textContent='No se pudo consultar el historial. Podés volver a intentar.';}finally{button.disabled=false;}
});
$('#demoGoalType')?.addEventListener('change',loadPage);
$('#missionSelect').addEventListener('change',renderMissionHelp);
function renderMissionHelp(){const m=state.view?.missions.find(m=>m.id===$('#missionSelect').value);$('#missionHelp').textContent=m?(m.mode==='individual'?'Esta misión es individual: cargá tu propia evidencia. Suma una vez por voluntario.':'Esta misión es por equipo: acuerden quién envía la evidencia. Suma una sola vez para el equipo.'):'Elegí una misión para ver cómo se participa.';}
loadPage();
