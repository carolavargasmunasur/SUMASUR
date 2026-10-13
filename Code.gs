const SETTINGS = {
  SPREADSHEET_ID: '1Pn8YybXXmfXVsuaN7YHP0CTHuIUqqQevjo_czYEf624',
  DRIVE_FOLDER_ID: '1QDk-UgQHDtF5JY8ZCEp95zH2CpEdx05T',

  SHEETS: {
    REGISTRATIONS: 'Registros',
    TEAMS: 'Equipos',
    MISSIONS: 'Misiones',
    SUBMISSIONS: 'Envios',
    LOG: 'Log'
  },

  MAX_FILE_BYTES: 8 * 1024 * 1024
};


/* =========================================================
   WEB APP
========================================================= */

function doGet(e) {
  try {
    const action = (e.parameter.action || 'bootstrap').toLowerCase();

    if (action === 'season') {
      return jsonResponse_({ ok: true, view: getSeasonView_() });
    }

    if (action === 'teamprogress') {
      const ss = SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);
      return jsonResponse_({ ok: true, progress: buildTeamProgress_(ss) });
    }

    if (action === 'bootstrap') {
      return jsonResponse_({
        ok: true,
        ...getBootstrap_()
      });
    }

    return jsonResponse_({
      ok: false,
      error: 'Acción GET desconocida.'
    });

  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: safeError_(error)
    });
  }
}


function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');

    if (body.action === 'submit') {
      return jsonResponse_({
        ok: true,
        ...submitSeasonLocked_(body)
      });
    }

    return jsonResponse_({
      ok: false,
      error: 'Acción POST desconocida.'
    });

  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: safeError_(error)
    });
  }
}


/* =========================================================
   DATOS PARA LA WEB
========================================================= */

function getBootstrap_() {

  const ss = SpreadsheetApp.openById(SETTINGS.SPREADSHEET_ID);

  const missions = valuesAsObjects_(
    ss.getSheetByName(SETTINGS.SHEETS.MISSIONS)
  )
    .filter(r =>
      String(r['Estado']).trim() === 'Activa' &&
      String(r['Visible en web']).trim() === 'Sí'
    )
    .map(r => ({
      id: r['ID misión'],
      title: r['Título'],
      description: r['Descripción'],
      type: r['Tipo'],
      points:
        Number(r['Puntos base']) +
        Number(r['Bonus'] || 0)
    }));


  const teams = valuesAsObjects_(
    ss.getSheetByName(SETTINGS.SHEETS.TEAMS)
  ).filter(r =>
    String(r['Activo']).trim() === 'Sí'
  );


  const registrations = valuesAsObjects_(
    ss.getSheetByName(SETTINGS.SHEETS.REGISTRATIONS)
  ).filter(r =>
    String(r['Activo']).trim() === 'Sí'
  );


  const submissions = valuesAsObjects_(
    ss.getSheetByName(SETTINGS.SHEETS.SUBMISSIONS)
  ).filter(r => !String(r['Temporada'] || '').trim());


  const ranking = teams.map(t => {

    const code = String(t['Código']).trim();

    const approved = submissions.filter(s =>
      String(s['Código equipo']).trim() === code &&
      String(s['Estado']).trim() === 'Aprobada'
    );

    return {
      team: t['Nombre visible'],

      points: approved.reduce(
        (n, s) =>
          n + Number(s['Puntos otorgados'] || 0),
        0
      ),

      approved: approved.length,

      members: registrations.filter(r =>
        String(r['Código equipo']).trim() === code
      ).length
    };

  }).sort(
    (a, b) =>
      b.points - a.points ||
      a.team.localeCompare(b.team)
  );


  return {

    missions,

    ranking,

    stats: {

      members: registrations.length,

      teams: teams.length,

      approved: submissions.filter(s =>
        String(s['Estado']).trim() === 'Aprobada'
      ).length,

      totalPoints: ranking.reduce(
        (n, r) => n + r.points,
        0
      )
    },

    updatedAt: new Date().toISOString()
  };
}


/* =========================================================
   ENVÍO DE EVIDENCIAS
========================================================= */

function createSubmission_(body) {

  const email =
    String(body.email || '')
      .trim()
      .toLowerCase();

  const missionId =
    String(body.missionId || '')
      .trim();

  const comment =
    String(body.comment || '')
      .trim();


  if (
    !email ||
    !missionId ||
    !comment ||
    !body.fileBase64
  ) {
    throw new Error(
      'Faltan datos obligatorios.'
    );
  }


  const ss =
    SpreadsheetApp.openById(
      SETTINGS.SPREADSHEET_ID
    );


  const registration =
    valuesAsObjects_(
      ss.getSheetByName(
        SETTINGS.SHEETS.REGISTRATIONS
      )
    ).find(r =>
      String(r['Mail MUNASUR'])
        .trim()
        .toLowerCase() === email &&
      String(r['Activo']).trim() === 'Sí'
    );


  if (!registration) {
    throw new Error(
      'Ese mail no figura como registrado o está inactivo.'
    );
  }


  const mission =
    valuesAsObjects_(
      ss.getSheetByName(
        SETTINGS.SHEETS.MISSIONS
      )
    ).find(r =>
      String(r['ID misión']).trim() === missionId &&
      String(r['Estado']).trim() === 'Activa'
    );


  if (!mission) {
    throw new Error(
      'La misión elegida no está activa.'
    );
  }


  const seasonId = validateSeasonSubmission_(ss, body, registration);

  const bytes =
    Utilities.base64Decode(
      body.fileBase64
    );


  if (
    bytes.length >
    SETTINGS.MAX_FILE_BYTES
  ) {
    throw new Error(
      'El archivo supera el máximo permitido.'
    );
  }


  const safeName =
    `${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}_` +
    `${email.split('@')[0]}_` +
    `${String(
      body.fileName || 'evidencia'
    ).replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )}`;


  const blob =
    Utilities.newBlob(
      bytes,
      body.mimeType ||
        'application/octet-stream',
      safeName
    );


  const file =
    DriveApp
      .getFolderById(
        SETTINGS.DRIVE_FOLDER_ID
      )
      .createFile(blob);


  const id =
    `ENV-${Utilities
      .getUuid()
      .slice(0, 8)
      .toUpperCase()}`;


  ss
    .getSheetByName(
      SETTINGS.SHEETS.SUBMISSIONS
    )
    .appendRow([
      id,
      new Date(),
      email,
      registration['Nombre y apellido'],
      registration['Código equipo'],
      missionId,
      mission['Título'],
      comment,
      file.getUrl(),
      'Pendiente',
      0,
      '',
      '',
      '',
      'No',
      '', // P: Notificación enviada
      seasonId, // Q: Temporada validada en servidor
      '', // R: Nivel de impacto, solo coordinación
      ''  // S: Resultado único, solo coordinación
    ]);


  log_(
    ss,
    'Nuevo envío',
    id,
    email,
    `${missionId} - ${registration['Código equipo']}`
  );


  return {
    submissionId: id
  };
}


/* =========================================================
   REGISTRO AUTOMÁTICO DESDE GOOGLE FORMS
========================================================= */

function registrarNuevoVoluntario(e) {

  const ss =
    SpreadsheetApp.openById(
      SETTINGS.SPREADSHEET_ID
    );

  const hojaRegistros =
    ss.getSheetByName(
      SETTINGS.SHEETS.REGISTRATIONS
    );


  if (!hojaRegistros) {
    throw new Error(
      'No existe la hoja "Registros".'
    );
  }


  if (!e || !e.namedValues) {
    throw new Error(
      'Esta función debe ejecutarse mediante el envío del formulario.'
    );
  }


  const respuestas =
    e.namedValues;


  const marcaTemporal =
    respuestas['Marca temporal']?.[0] ||
    new Date();


  const nombre =
    respuestas['Nombre y apellido']?.[0] ||
    '';


  const mail =
    respuestas['Mail MUNASUR']?.[0] ||
    '';


  const grupo =
    respuestas['Nombre del grupo']?.[0] ||
    '';


  if (!mail) {

    console.log(
      JSON.stringify(respuestas)
    );

    throw new Error(
      'No se encontró la respuesta "Mail MUNASUR". Revisá el nombre exacto de la pregunta del formulario.'
    );
  }


  const ultimaFila =
    hojaRegistros.getLastRow();


  if (ultimaFila >= 2) {

    const mailsExistentes =
      hojaRegistros
        .getRange(
          2,
          3,
          ultimaFila - 1,
          1
        )
        .getValues()
        .flat()
        .map(m =>
          String(m)
            .trim()
            .toLowerCase()
        );


    if (
      mailsExistentes.includes(
        mail
          .trim()
          .toLowerCase()
      )
    ) {

      console.log(
        `El mail ${mail} ya estaba registrado.`
      );

      return;
    }
  }


  hojaRegistros.appendRow([
    marcaTemporal,
    nombre,
    mail,
    grupo,
    '',
    'No'
  ]);


  log_(
    ss,
    'Nuevo voluntario',
    '',
    mail,
    `${nombre} - ${grupo}`
  );
}


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

function valuesAsObjects_(sheet) {

  if (!sheet) {
    throw new Error(
      'Falta una hoja requerida en Google Sheets.'
    );
  }


  const values =
    sheet
      .getDataRange()
      .getDisplayValues();


  if (values.length < 2) {
    return [];
  }


  const headers =
    values
      .shift()
      .map(String);


  return values
    .filter(row =>
      row.some(v =>
        v !== ''
      )
    )
    .map(row =>
      headers.reduce(
        (o, h, i) => {
          o[h] = row[i];
          return o;
        },
        {}
      )
    );
}


function log_(
  ss,
  action,
  id,
  user,
  detail
) {

  const sheet =
    ss.getSheetByName(
      SETTINGS.SHEETS.LOG
    );


  if (sheet) {
    sheet.appendRow([
      new Date(),
      action,
      id,
      user,
      detail
    ]);
  }
}


function jsonResponse_(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


function safeError_(error) {

  console.error(error);

  return error &&
    error.message
    ? error.message
    : 'Error inesperado.';
}

/* =========================================================
   CONFIGURACIÓN DE EMAILS
========================================================= */

const EMAIL_CONFIG = {

  // Cuando subamos el logo a Drive,
  // vamos a pegar acá su ID.
  // Por ahora puede quedar vacío.
  LOGO_URL: 'https://sumasur.vercel.app/logo.png',

  COLOR_PRINCIPAL: '#7eb7e4',

  NOMBRE_REMITENTE: 'MUNASUR'
};


/* =========================================================
   NOTIFICAR REVISIÓN DE UNA MISIÓN
========================================================= */

function notificarRevisionMision(e) {

  // Evita errores si alguien intenta ejecutar
  // esta función manualmente desde Apps Script.
  if (!e || !e.range) {
    return;
  }


  const sheet = e.range.getSheet();


  /* -------------------------------------------------------
     SOLO FUNCIONA EN LA HOJA "Envios"
  ------------------------------------------------------- */

  if (
    sheet.getName() !==
    SETTINGS.SHEETS.SUBMISSIONS
  ) {
    return;
  }


  const fila = e.range.getRow();
  const columna = e.range.getColumn();


  // No tocar encabezados
  if (fila < 2) {
    return;
  }


  /* -------------------------------------------------------
     SOLO SE DISPARA CUANDO CAMBIAMOS "ESTADO"

     J = columna 10
  ------------------------------------------------------- */

  if (columna !== 10) {
    return;
  }


  /* -------------------------------------------------------
     LEER TODA LA FILA
  ------------------------------------------------------- */

  const datos = sheet
    .getRange(
      fila,
      1,
      1,
      Math.max(16, Math.min(19, sheet.getLastColumn()))
    )
    .getValues()[0];


  const idEnvio =
    String(datos[0] || '').trim();
  // A


  const email =
    String(datos[2] || '')
      .trim()
      .toLowerCase();
  // C


  const nombre =
    String(datos[3] || '').trim();
  // D


  const equipo =
    String(datos[4] || '').trim();
  // E


  const idMision =
    String(datos[5] || '').trim();
  // F


  const tituloMision =
    String(datos[6] || '').trim();
  // G


  const estado =
    String(datos[9] || '').trim();
  // J


  const esTemporada = Boolean(String(datos[16] || '').trim());

  const puntos =
    Number(datos[10] || 0);
  // K


  const devolucion =
    String(datos[11] || '').trim();
  // L


  const notificacionEnviada =
    String(datos[15] || '').trim();
  // P


  /* -------------------------------------------------------
     VALIDACIONES
  ------------------------------------------------------- */

  if (!email) {
    throw new Error(
      'El envío no tiene un mail asociado.'
    );
  }


  // Solo notificamos estos dos estados.
  if (
    estado !== 'Aprobada' &&
    estado !== 'Rechazada'
  ) {
    return;
  }


  // Evita mandar el mismo mail dos veces.
  if (
    notificacionEnviada === 'Sí'
  ) {
    return;
  }


  // Si rechazamos, la devolución es obligatoria.
  if (
    estado === 'Rechazada' &&
    !devolucion
  ) {

    throw new Error(
      'Antes de rechazar una misión tenés que completar "Motivo / devolución".'
    );

  }


  /* -------------------------------------------------------
     LOGO
     
     Si LOGO_FILE_ID está vacío,
     el mail funciona sin logo.
     
     Después podemos agregarlo.
  ------------------------------------------------------- */

  let logoHtml = '';

  const inlineImages = {};


  if (
    EMAIL_CONFIG.LOGO_FILE_ID
  ) {

    try {

      const logoBlob =
        DriveApp
          .getFileById(
            EMAIL_CONFIG.LOGO_FILE_ID
          )
          .getBlob();


      inlineImages.logoMunasur =
        logoBlob;


      logoHtml = `
        <div style="
          background:#7eb7e4;
          padding:24px;
          text-align:center;
        ">
        <img
          src="${EMAIL_CONFIG.LOGO_URL}"
          alt="MUNASUR"
          width="180"
          style="
          display:block;
          width:180px;
          max-width:180px;
          height:auto;
          margin:0 auto;
        "
        >
        </div>
`;

    }

    catch (error) {

      console.error(
        'No se pudo cargar el logo:',
        error
      );

    }

  }


  /* -------------------------------------------------------
     VARIABLES DEL EMAIL
  ------------------------------------------------------- */

  let asunto = '';

  let htmlBody = '';

  let textoPlano = '';


  /* =======================================================
     MISIÓN APROBADA
  ======================================================= */

  if (
    estado === 'Aprobada'
  ) {

    asunto =
      `¡Misión aprobada! | ${tituloMision}`;


    htmlBody = `

      <div style="
        margin:0;
        padding:0;
        background:#ffffff;
      ">

        <div style="
          max-width:600px;
          margin:0 auto;
          background:#ffffff;
          font-family:Raleway,Arial,sans-serif;
          color:#000000;
        ">


          ${logoHtml}


          <div style="
            padding:36px 32px;
          ">


            <div style="
              text-align:center;
              margin-bottom:30px;
            ">

              <div style="
                font-family:Poppins,Arial,sans-serif;
                font-size:28px;
                line-height:1.2;
                font-weight:700;
                color:#7eb7e4;
                margin-bottom:10px;
              ">

                ¡Misión aprobada!

              </div>


              <div style="
                width:56px;
                height:4px;
                background:#7eb7e4;
                margin:0 auto;
                border-radius:20px;
              ">
              </div>

            </div>


            <p style="
              margin:0 0 18px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Hola
              ${escapeEmailHtml_(nombre)}
              👋

            </p>


            <p style="
              margin:0 0 8px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Revisamos tu envío de la misión:

            </p>


            <div style="
              font-family:Poppins,Arial,sans-serif;
              font-size:20px;
              line-height:1.4;
              font-weight:700;
              color:#7eb7e4;
              margin:0 0 24px 0;
            ">

              ${escapeEmailHtml_(tituloMision)}

            </div>


            <p style="
              margin:0 0 18px 0;
              font-size:16px;
              line-height:1.7;
            ">

              El envío fue
              <strong>aprobado</strong>.

            </p>


            <div style="
              background:#7eb7e4;
              color:#ffffff;
              padding:22px;
              border-radius:16px;
              margin:26px 0;
              text-align:center;
            ">

              <div style="
                font-family:Raleway,Arial,sans-serif;
                font-size:15px;
                margin-bottom:6px;
              ">

                Tu equipo

              </div>


              <div style="
                font-family:Poppins,Arial,sans-serif;
                font-size:20px;
                font-weight:700;
                margin-bottom:10px;
              ">

                ${escapeEmailHtml_(equipo)}

              </div>


              <div style="
                font-family:Raleway,Arial,sans-serif;
                font-size:15px;
              ">

                ${esTemporada ? 'compartió' : 'sumó'}

              </div>


              <div style="
                font-family:Poppins,Arial,sans-serif;
                font-size:28px;
                font-weight:700;
              ">

                ${esTemporada ? 'un aporte revisado' : '+' + puntos + (puntos === 1 ? ' punto' : ' puntos')}

              </div>

            </div>


            ${
              devolucion
                ? `

                  <div style="
                    border:2px solid #7eb7e4;
                    padding:20px;
                    border-radius:16px;
                    margin:26px 0;
                  ">

                    <div style="
                      font-family:Poppins,Arial,sans-serif;
                      color:#7eb7e4;
                      font-size:16px;
                      font-weight:700;
                      margin-bottom:8px;
                    ">

                      Devolución

                    </div>


                    <div style="
                      font-family:Raleway,Arial,sans-serif;
                      color:#000000;
                      font-size:15px;
                      line-height:1.7;
                    ">

                      ${escapeEmailHtml_(devolucion)}

                    </div>

                  </div>

                `
                : ''
            }


            <p style="
              margin:26px 0 0 0;
              font-size:16px;
              line-height:1.7;
            ">

              Gracias por seguir construyendo
              MUNASUR entre modelo y modelo.

            </p>


            <div style="
              margin-top:34px;
              padding-top:22px;
              border-top:1px solid #7eb7e4;
              text-align:center;
              font-family:Poppins,Arial,sans-serif;
              color:#7eb7e4;
              font-size:13px;
              font-weight:600;
            ">

              MUNASUR

            </div>


          </div>

        </div>

      </div>

    `;


    textoPlano =
      `Hola ${nombre}.\n\n` +
      `Tu misión "${tituloMision}" fue aprobada.\n\n` +
      (esTemporada ? `Tu equipo ${equipo} compartió un aporte revisado. Consultá el progreso validado en SUMASUR.\n\n` : `Tu equipo ${equipo} sumó ${puntos} ${puntos === 1 ? 'punto' : 'puntos'}.\n\n`) +
      (
        devolucion
          ? `Devolución: ${devolucion}\n\n`
          : ''
      ) +
      `Gracias por seguir construyendo MUNASUR entre modelo y modelo.`;

  }


  /* =======================================================
     MISIÓN RECHAZADA
  ======================================================= */

  if (
    estado === 'Rechazada'
  ) {

    asunto =
      `Revisión de misión | ${tituloMision}`;


    htmlBody = `

      <div style="
        margin:0;
        padding:0;
        background:#ffffff;
      ">

        <div style="
          max-width:600px;
          margin:0 auto;
          background:#ffffff;
          font-family:Raleway,Arial,sans-serif;
          color:#000000;
        ">


          ${logoHtml}


          <div style="
            padding:36px 32px;
          ">


            <div style="
              text-align:center;
              margin-bottom:30px;
            ">

              <div style="
                font-family:Poppins,Arial,sans-serif;
                font-size:28px;
                line-height:1.2;
                font-weight:700;
                color:#7eb7e4;
                margin-bottom:10px;
              ">

                Tu misión fue revisada

              </div>


              <div style="
                width:56px;
                height:4px;
                background:#7eb7e4;
                margin:0 auto;
                border-radius:20px;
              ">
              </div>

            </div>


            <p style="
              margin:0 0 18px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Hola
              ${escapeEmailHtml_(nombre)}
              👋

            </p>


            <p style="
              margin:0 0 8px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Revisamos tu envío de la misión:

            </p>


            <div style="
              font-family:Poppins,Arial,sans-serif;
              font-size:20px;
              line-height:1.4;
              font-weight:700;
              color:#7eb7e4;
              margin:0 0 24px 0;
            ">

              ${escapeEmailHtml_(tituloMision)}

            </div>


            <p style="
              margin:0 0 22px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Por el momento, el envío
              <strong>no fue aprobado</strong>.

            </p>


            <div style="
              background:#7eb7e4;
              color:#ffffff;
              padding:22px;
              border-radius:16px;
              margin:26px 0;
            ">


              <div style="
                font-family:Poppins,Arial,sans-serif;
                font-size:16px;
                font-weight:700;
                margin-bottom:10px;
              ">

                Devolución de coordinación

              </div>


              <div style="
                font-family:Raleway,Arial,sans-serif;
                font-size:15px;
                line-height:1.7;
              ">

                ${escapeEmailHtml_(devolucion)}

              </div>


            </div>


            <p style="
              margin:0 0 18px 0;
              font-size:16px;
              line-height:1.7;
            ">

              Si corresponde, podés volver a realizar
              la misión siguiendo esta devolución.

            </p>


            <p style="
              margin:26px 0 0 0;
              font-size:16px;
              line-height:1.7;
            ">

              Gracias por seguir siendo parte de MUNASUR.

            </p>


            <div style="
              margin-top:34px;
              padding-top:22px;
              border-top:1px solid #7eb7e4;
              text-align:center;
              font-family:Poppins,Arial,sans-serif;
              color:#7eb7e4;
              font-size:13px;
              font-weight:600;
            ">

              MUNASUR

            </div>


          </div>

        </div>

      </div>

    `;


    textoPlano =
      `Hola ${nombre}.\n\n` +
      `Revisamos tu envío de la misión "${tituloMision}".\n\n` +
      `Por el momento, el envío no fue aprobado.\n\n` +
      `Devolución de coordinación: ${devolucion}\n\n` +
      `Si corresponde, podés volver a realizar la misión siguiendo esta devolución.\n\n` +
      `Gracias por seguir siendo parte de MUNASUR.`;

  }


  /* =======================================================
     ENVIAR EMAIL
  ======================================================= */

  const opcionesMail = {

    to: email,

    subject: asunto,

    body: textoPlano,

    htmlBody: htmlBody,

    name:
      EMAIL_CONFIG.NOMBRE_REMITENTE

  };


  // Solo añadimos inlineImages
  // cuando tengamos el logo configurado.
  if (
    Object.keys(inlineImages).length > 0
  ) {

    opcionesMail.inlineImages =
      inlineImages;

  }


  MailApp.sendEmail(
    opcionesMail
  );


  /* =======================================================
     MARCAR COMO NOTIFICADO
  ======================================================= */

  // P = Notificación enviada
  sheet
    .getRange(
      fila,
      16
    )
    .setValue('Sí');


  // N = Fecha revisión
  sheet
    .getRange(
      fila,
      14
    )
    .setValue(
      new Date()
    );


  /* =======================================================
     GUARDAR EN LOG
  ======================================================= */

  log_(
    e.source,
    'Notificación enviada',
    idEnvio,
    email,
    `${idMision} - ${estado}`
  );

}


/* =========================================================
   PROTEGER TEXTO QUE ENTRA AL EMAIL
========================================================= */

function escapeEmailHtml_(
  value = ''
) {

  return String(value).replace(

    /[&<>"']/g,

    caracter => ({

      '&': '&amp;',

      '<': '&lt;',

      '>': '&gt;',

      '"': '&quot;',

      "'": '&#039;'

    })[caracter]

  );

}

/**
 * Progreso agregado por equipo, integrado en doGet.
 * Solo lectura: no modifica la planilla ni envía notificaciones.
 */
function buildTeamProgress_(ss) {
  if (!ss) throw new Error('Falta la planilla del sistema.');

  function read(name, required) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error('Falta la pestaña ' + name);
    var values = sheet.getDataRange().getDisplayValues();
    var headers = values.shift().map(function (value) { return value.trim(); });
    required.forEach(function (header) {
      if (headers.indexOf(header) === -1) throw new Error('Falta ' + header + ' en ' + name);
    });
    return values.filter(function (row) {
      return row.some(function (value) { return value.trim() !== ''; });
    }).map(function (row) {
      var item = {};
      headers.forEach(function (header, i) { item[header] = String(row[i] || '').trim(); });
      return item;
    });
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  // Alcance de la misión puente: incluye las anteriores aunque estén inactivas.
  // Mantener esta lista explícita evita incluir automáticamente desafíos futuros.
  var includedIds = ['M001', 'M002.0', 'M002.1', 'M003', 'MEPU', 'M004', 'M005', 'M006'];
  var missions = read('Misiones', ['ID misión', 'Título']);
  var teams = read('Equipos', ['Código', 'Nombre visible', 'Activo']).filter(function (team) {
    return normalize(team.Activo) === 'si';
  });
  var submissions = read('Envios', ['ID envío', 'Código equipo', 'ID misión', 'Estado']);
  var catalog = includedIds.map(function (id) {
    var rows = missions.filter(function (mission) { return mission['ID misión'] === id; });
    if (!rows.length) throw new Error('No se encontró la misión ' + id);
    if (id !== 'MEPU' && rows.length !== 1) throw new Error('ID de misión repetido: ' + id);
    // MEPU es una misión con variantes por equipo; no son once requisitos distintos.
    return { id: id, title: id === 'MEPU' ? 'Misión especial PARUCC' : rows[0]['Título'] };
  });

  var seenTeams = new Set();
  teams.forEach(function (team) {
    var code = team['Código'];
    if (!code || !team['Nombre visible'] || seenTeams.has(code)) {
      throw new Error('Revisar códigos y nombres de equipos activos.');
    }
    seenTeams.add(code);
  });

  var seenSubmissions = new Set();
  var states = new Map();
  var approved = 0;
  submissions.forEach(function (submission) {
    var id = submission['ID envío'];
    if (!id || seenSubmissions.has(id)) throw new Error('ID de envío vacío o repetido.');
    seenSubmissions.add(id);
    var status = normalize(submission.Estado);
    var key = JSON.stringify([submission['Código equipo'], submission['ID misión']]);
    if (status === 'aprobada') {
      approved += 1;
      states.set(key, 'completed');
    } else if ((status === 'pendiente' || status === 'revisar') && states.get(key) !== 'completed') {
      states.set(key, 'review');
    }
  });

  return {
    updatedAt: new Date().toISOString(),
    approvedSubmissions: approved,
    teams: teams.map(function (team) {
      var code = team['Código'];
      return {
        code: code,
        name: team['Nombre visible'],
        missions: catalog.map(function (mission) {
          return {
            id: mission.id,
            title: mission.title,
            status: states.get(JSON.stringify([code, mission.id])) || 'pending'
          };
        })
      };
    })
  };
}
