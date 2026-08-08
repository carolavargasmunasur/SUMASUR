const API_URL = window.MUNASUR_CONFIG?.API_URL || "";

const state = {
  missions: [],
  ranking: []
};

const $ = (selector) => document.querySelector(selector);


/* ==============================
   SEGURIDAD DE TEXTO
============================== */

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}


/* ==============================
   CONEXIÓN CON APPS SCRIPT
============================== */

async function api(action, payload = null) {

  if (!API_URL || API_URL.includes("PEGAR_")) {
    throw new Error(
      "Falta configurar la URL de Apps Script en config.js"
    );
  }

  let url = API_URL;

  const options = payload
    ? {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action,
          ...payload
        }),
        cache: "no-store"
      }
    : {
        method: "GET",
        cache: "no-store"
      };


  /* Si es GET, agregamos action + timestamp
     para impedir que navegador/Vercel reutilicen datos viejos */
  if (!payload) {
    url =
      `${API_URL}?action=${encodeURIComponent(action)}` +
      `&_=${Date.now()}`;
  }


  const response = await fetch(url, options);


  if (!response.ok) {
    throw new Error(
      `Error de conexión (${response.status})`
    );
  }


  const data = await response.json();


  if (!data.ok) {
    throw new Error(
      data.error ||
      "No se pudo completar la operación"
    );
  }


  return data;
}


/* ==============================
   MISIONES
============================== */

function renderMissions() {

  const container = $("#missions");
  const select = $("#missionSelect");

  select.innerHTML =
    '<option value="">Elegí una misión</option>';


  if (!state.missions.length) {

    container.innerHTML =
      '<div class="empty">Todavía no hay misiones activas publicadas.</div>';

    return;
  }


  container.innerHTML =
    state.missions.map(m => `

      <article class="card">

        <div class="card__top">

          <span class="pill">
            ${escapeHtml(m.type)}
          </span>

          <span class="points">
            +${Number(m.points || 0)} pts
          </span>

        </div>

        <h3>
          ${escapeHtml(m.title)}
        </h3>

        <p>
          ${escapeHtml(m.description)}
        </p>

        <button
          class="button js-mission"
          data-id="${escapeHtml(m.id)}"
        >
          Subir evidencia
        </button>

      </article>

    `).join("");


  state.missions.forEach(m => {

    const option =
      document.createElement("option");

    option.value = m.id;

    option.textContent =
      `${m.title} (+${m.points} pts)`;

    select.appendChild(option);

  });


  document
    .querySelectorAll(".js-mission")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => openDialog(btn.dataset.id)
      );

    });
}


/* ==============================
   RANKING
============================== */

function renderRanking() {

  const container =
    $("#rankingList");


  if (!state.ranking.length) {

    container.innerHTML =
      '<div class="empty">El ranking aparecerá cuando haya equipos registrados.</div>';

    return;
  }


  container.innerHTML =
    state.ranking.map((r, index) => `

      <div class="rank-row">

        <div class="rank-position">
          ${index + 1}º
        </div>

        <div>

          <div class="rank-team">
            ${escapeHtml(r.team)}
          </div>

          <div class="rank-meta">

            ${Number(r.approved || 0)}
            misiones aprobadas

            ·

            ${Number(r.members || 0)}
            integrantes

          </div>

        </div>

        <div class="rank-score">
          ${Number(r.points || 0)} pts
        </div>

      </div>

    `).join("");
}


/* ==============================
   ESTADÍSTICAS
============================== */

function renderStats(stats = {}) {

  const values = [

    [
      stats.members || 0,
      "personas registradas"
    ],

    [
      stats.teams || 0,
      "equipos activos"
    ],

    [
      stats.approved || 0,
      "acciones aprobadas"
    ],

    [
      stats.totalPoints || 0,
      "puntos comunitarios"
    ]

  ];


  $("#stats").innerHTML =
    values.map(([number, label]) => `

      <div class="stat">

        <strong>
          ${Number(number)}
        </strong>

        <span>
          ${label}
        </span>

      </div>

    `).join("");
}


/* ==============================
   CARGAR DATOS
============================== */

async function loadPage() {

  try {

    const data =
      await api("bootstrap");


    console.log(
      "Datos recibidos desde Google Sheets:",
      data
    );


    state.missions =
      data.missions || [];

    state.ranking =
      data.ranking || [];


    renderMissions();

    renderRanking();

    renderStats(
      data.stats
    );


    if (data.updatedAt) {

      $("#lastUpdate").textContent =
        `Actualizado: ${
          new Date(
            data.updatedAt
          ).toLocaleString(
            "es-AR"
          )
        }`;

    }

  }

  catch (error) {

    console.error(
      "ERROR cargando MUNASUR:",
      error
    );


    $("#missions").innerHTML =
      `<div class="empty">
        ${escapeHtml(error.message)}
      </div>`;


    $("#rankingList").innerHTML =
      `<div class="empty">
        No se pudo cargar el ranking.
      </div>`;


    renderStats({});

  }
}


/* ==============================
   MODAL DE EVIDENCIAS
============================== */

function openDialog(
  missionId = ""
) {

  if (missionId) {
    $("#missionSelect").value =
      missionId;
  }

  $("#submitDialog")
    .showModal();
}


/* ==============================
   ARCHIVO → BASE64
============================== */

function fileToBase64(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload = () => {

        const base64 =
          String(reader.result)
            .split(",")[1];

        resolve(base64);

      };


      reader.onerror =
        reject;


      reader.readAsDataURL(file);

    }
  );
}


/* ==============================
   ENVIAR EVIDENCIA
============================== */

$("#submissionForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const button =
        $("#submitButton");

      const message =
        $("#formMessage");

      const file =
        $("#evidence").files[0];


      if (!file) {
        return;
      }


      if (
        file.size >
        8 * 1024 * 1024
      ) {

        message.textContent =
          "El archivo supera los 8 MB.";

        message.className =
          "form-message error";

        return;
      }


      button.disabled =
        true;

      button.textContent =
        "Enviando…";

      message.textContent =
        "";


      try {

        const base64 =
          await fileToBase64(file);


        await api(
          "submit",
          {

            email:
              $("#email")
                .value
                .trim()
                .toLowerCase(),

            missionId:
              $("#missionSelect")
                .value,

            comment:
              $("#comment")
                .value
                .trim(),

            fileName:
              file.name,

            mimeType:
              file.type ||
              "application/octet-stream",

            fileBase64:
              base64

          }
        );


        event.target.reset();


        message.textContent =
          "¡Listo! El envío quedó pendiente de revisión.";

        message.className =
          "form-message success";


        setTimeout(
          () =>
            $("#submitDialog")
              .close(),
          1800
        );

      }

      catch (error) {

        console.error(
          error
        );

        message.textContent =
          error.message;

        message.className =
          "form-message error";

      }

      finally {

        button.disabled =
          false;

        button.textContent =
          "Enviar para revisión";

      }

    }
  );


/* ==============================
   BOTONES
============================== */

$("#openSubmitTop")
  ?.addEventListener(
    "click",
    () => openDialog()
  );


$("#openSubmitHero")
  ?.addEventListener(
    "click",
    () => openDialog()
  );


$("#closeDialog")
  ?.addEventListener(
    "click",
    () =>
      $("#submitDialog").close()
  );


/* ==============================
   INICIAR
============================== */

loadPage();
