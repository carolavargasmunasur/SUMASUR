/* La acción teamProgress devuelve solo progreso agregado, sin datos personales. */
(() => {
  const select = document.querySelector('#teamProgressSelect');
  const message = document.querySelector('#progressMessage');
  const content = document.querySelector('#teamProgressContent');
  const refresh = document.querySelector('#refreshProgress');
  let progress;
  let loading = false;
  const labels = {
    completed: '✅ Completada',
    review: '🕓 En revisión',
    pending: '⭕ Por completar'
  };
  const order = {pending: 0, review: 1, completed: 2};

  function renderTeam() {
    const team = progress.teams.find(item => item.code === select.value);
    if (!team) return;
    const completed = team.missions.filter(m => m.status === 'completed').length;
    const review = team.missions.filter(m => m.status === 'review').length;
    const pending = team.missions.length - completed - review;
    document.querySelector('#teamProgressSummary').innerHTML = `
      <h3>${escapeHtml(team.name)}</h3>
      <p><strong>${completed} de ${team.missions.length} misiones completadas</strong></p>
      <progress value="${completed}" max="${Math.max(1, team.missions.length)}"
        aria-label="Misiones completadas de ${escapeHtml(team.name)}"></progress>
      <p class="muted">${pending} por completar · ${review} en revisión</p>`;
    const list = document.querySelector('#teamMissionList');
    list.replaceChildren();
    [...team.missions].sort((a, b) => order[a.status] - order[b.status]).forEach(mission => {
      const li = document.createElement('li');
      li.className = 'team-mission team-mission--' + mission.status;
      li.innerHTML = `<div><span class="team-mission__id">${escapeHtml(mission.id)}</span>
        <h4>${escapeHtml(mission.title)}</h4></div>
        <span class="team-mission__status">${labels[mission.status]}</span>`;
      // El formulario existente solo admite IDs. No ofrecer MEPU (ID repetido).
      const available = state.missions.filter(m => m.id === mission.id);
      if (mission.status === 'pending' && available.length === 1 && mission.id !== 'MEPU') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = 'Subir evidencia';
        button.addEventListener('click', () => openDialog(mission.id));
        li.appendChild(button);
      }
      list.appendChild(li);
    });
    if (!team.missions.length) {
      list.innerHTML = '<li class="empty">Todavía no hay misiones incluidas para este equipo.</li>';
    }
  }

  function validProgress(data) {
    return data && Number.isInteger(data.approvedSubmissions) && data.approvedSubmissions >= 0 &&
      typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) &&
      Array.isArray(data.teams) && data.teams.every(team =>
        typeof team.code === 'string' && typeof team.name === 'string' &&
        Array.isArray(team.missions) && team.missions.every(m =>
          typeof m.id === 'string' && typeof m.title === 'string' &&
          Object.hasOwn(labels, m.status)));
  }

  async function loadProgress() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    message.textContent = 'Consultando el progreso…';
    content.hidden = true;
    try {
      const data = await api('teamProgress');
      if (!validProgress(data.progress)) throw new Error('Progreso no disponible');
      progress = data.progress;
      const previous = select.value;
      select.replaceChildren();
      progress.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.code;
        option.textContent = team.name;
        select.appendChild(option);
      });
      if (progress.teams.some(team => team.code === previous)) select.value = previous;
      if (!progress.teams.length) {
        message.textContent = 'Todavía no hay equipos activos.';
        return;
      }
      const allComplete = progress.teams.filter(team => team.missions.length &&
        team.missions.every(m => m.status === 'completed')).length;
      document.querySelector('#collectiveProgress').textContent =
        `${progress.approvedSubmissions} entregas aprobadas entre todos · ` +
        `${allComplete} de ${progress.teams.length} equipos con todas sus misiones completadas`;
      document.querySelector('#progressUpdatedAt').textContent = 'Consultado: ' +
        new Date(progress.updatedAt).toLocaleString('es-AR');
      content.hidden = false;
      message.textContent = '';
      renderTeam();
    } catch (error) {
      // No convertir una falla de conexión en falsas misiones pendientes.
      message.textContent = 'El progreso por equipo no está disponible en este momento. Podés seguir consultando las misiones y volver a intentar con “Actualizar”.';
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  select.addEventListener('change', renderTeam);
  refresh.addEventListener('click', loadProgress);
  document.addEventListener('munasur:missions-loaded', () => {
    if (progress && !content.hidden) renderTeam();
  });
  document.addEventListener('munasur:submission-sent', loadProgress);
  loadProgress();
})();
