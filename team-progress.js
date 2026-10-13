/* Una sola respuesta alimenta el impacto colectivo y el recorrido del equipo. */
(() => {
  const select=document.querySelector('#teamProgressSelect');
  const statusLabels={completed:'✓ Completada',partial:'◐ En progreso',review:'◷ En revisión',pending:'○ Pendiente'};
  const order={pending:0,partial:1,review:2,completed:3};
  function renderTeam(){
    const team=state.view?.teams.find(t=>t.code===select.value);if(!team)return;
    const reviews=team.missions.reduce((n,m)=>n+m.reviewCount,0);
    $('#teamProgressSummary').innerHTML=`<h3>${escapeHtml(team.name)}</h3><p><strong>${team.points} puntos de impacto</strong><br>${team.completed} aportes aprobados · ${reviews} en revisión</p><progress value="${team.completed}" max="${Math.max(1,team.required)}" aria-label="Participaciones completadas de ${escapeHtml(team.name)}"></progress><p>${team.completed} de ${team.required} participaciones posibles.<br>Las individuales cuentan por voluntario; las grupales, una vez por equipo.</p>`;
    $('#teamMissionList').innerHTML=team.missions.length?[...team.missions].sort((a,b)=>order[a.status]-order[b.status]).map(m=>`<article class="team-mission ${m.status}"><div><small>${m.mode==='individual'?'INDIVIDUAL':'POR EQUIPO'} · ${escapeHtml(m.id)}</small><h4>${escapeHtml(m.title)}</h4><small class="mission-detail">${m.mode==='individual'?`${m.completedCount} de ${m.requiredCount} voluntarios completaron`:`${m.completedCount} de 1 aporte del equipo aprobado`} · ${m.points} pts${m.reviewCount?` · ${m.reviewCount} en revisión`:''}</small></div><div class="team-actions"><span class="team-state">${statusLabels[m.status]}</span>${m.pendingCount>0&&state.view.missions.find(x=>x.id===m.id)?.open&&!state.demo?`<button class="text-button" data-mission="${escapeHtml(m.id)}">Cargar misión ↗</button>`:''}</div></article>`).join(''):'<p class="empty">Este equipo todavía no tiene misiones asignadas en la temporada.</p>';
  }
  function update(){
    const previous=select.value,teams=state.view?.teams||[];select.replaceChildren();select.disabled=!teams.length;
    if(!teams.length){select.add(new Option('Sin equipos para mostrar',''));$('#teamProgressSummary').textContent='El progreso se muestra con las revisiones de coordinación.';$('#teamMissionList').innerHTML='<p class="empty">El recorrido de los equipos aparecerá al publicar la temporada.</p>';return;}
    teams.forEach(t=>select.add(new Option(t.name,t.code)));if(teams.some(t=>t.code===previous))select.value=previous;renderTeam();
  }
  select.addEventListener('change',renderTeam);
  $('#teamMissionList').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b)openDialog(b.dataset.mission);});
  document.addEventListener('sumasur:season-loaded',update);
  document.addEventListener('sumasur:submission-sent',()=>setTimeout(loadPage,0));
  if(state.view)update();
})();
