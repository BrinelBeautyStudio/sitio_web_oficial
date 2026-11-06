/* ═════ Generador de órdenes · Brinel Beauty (v2: ingreso con Google + historial) ═════
   - La seguridad real está en las reglas de Firestore (firestore.rules): solo los
     correos autorizados pueden leer o escribir órdenes. La revisión de correo de
     este archivo es solo para mostrar un mensaje claro.
   - Los datos de la clienta solo se escriben en pantalla con textContent (nunca innerHTML). */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, runTransaction, getDocs, query, orderBy, limit, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Configuración pública del proyecto (no es secreta: la protección está en las reglas).
const firebaseConfig = {
  apiKey: 'AIzaSyApHjbTPq5Kqb53vRQgaEeiai3k2-xUx8E',
  authDomain: 'brinel-beauty.firebaseapp.com',
  projectId: 'brinel-beauty',
  storageBucket: 'brinel-beauty.firebasestorage.app',
  messagingSenderId: '272660556098',
  appId: '1:272660556098:web:696778ebc2c785959500db'
};
// Deben coincidir con la lista de firestore.rules.
const AUTORIZADOS = ['marjoriebrinella@gmail.com', 'mjcontrolsystems@gmail.com'];

// Catálogo: para agregar un servicio, agréguelo a esta lista.
const SERVICIOS = [
  'Maquillaje y peinado', 'Maquillaje social', 'Maquillaje natural', 'Maquillaje express',
  'Peinado', 'Corte', 'Tinte', 'Uñas', 'Diseño de cejas', 'Micropigmentación', 'Extensiones de pestañas'
];
const OTRO = 'Otro…';
const NOTA_INICIAL = 'cambios de horario o número de personas, avisar con anticipación. Presente este número de orden el día del evento.';
const PRIMER_NUMERO = 160;
const K_BORRADOR = 'brinel-orden-borrador';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// La sesión dura solo mientras la pestaña esté abierta: al volver a entrar pide Google otra vez.
const MARCA_SESION = 'brinel-sesion-activa';
const MINUTOS_INACTIVIDAD = 30;
await setPersistence(auth, browserSessionPersistence).catch(() => {});
const db = getFirestore(app);

const $ = (s, r = document) => r.querySelector(s);
const form = $('#formOrden');
const hoja = $('#hoja');
const lineas = $('#lineas');
let idActual = null;        // id en Firestore de la orden abierta (null = nueva)
let numeroActual = '';      // BR-0000 de la orden abierta
let fechaEmision = null;    // fecha de creación de la orden abierta
let ordenes = [];           // historial cargado

// ── utilidades ──
const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
const borrarLocal = (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } };
const dinero = (n) => 'Q ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.min(n, 1000000) : 0; };
const entero = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 0; };
const fechaCorta = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
const fechaLarga = (iso) => { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return p ? (+p[3]) + ' de ' + MESES[+p[2] - 1] + ' de ' + p[1] : ''; };
const horaTexto = (hm) => {
  const p = /^(\d{2}):(\d{2})$/.exec(hm || ''); if (!p) return '';
  let h = +p[1]; const ap = h < 12 ? 'a. m.' : 'p. m.'; h = h % 12 || 12;
  return h + ':' + p[2] + ' ' + ap;
};
const unir = (l) => l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
const el = (tag, props = {}, hijos = []) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); });
  hijos.forEach((h) => e.appendChild(h));
  return e;
};
let temporizadorAviso;
function aviso(texto, mal) {
  const a = $('#aviso'); a.textContent = texto; a.className = 'aviso' + (mal ? ' mal' : ''); a.hidden = false;
  clearTimeout(temporizadorAviso); temporizadorAviso = setTimeout(() => { a.hidden = true; }, 3500);
}

// ═════════════ INGRESO ═════════════
const proveedor = new GoogleAuthProvider();
proveedor.setCustomParameters({ prompt: 'select_account' });

$('#btnEntrar').addEventListener('click', async () => {
  $('#msgIngreso').textContent = ''; $('#msgIngreso').className = 'ingreso-msg';
  try { sessionStorage.setItem(MARCA_SESION, '1'); } catch (e) { /* nada */ }
  try {
    await signInWithPopup(auth, proveedor);
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, proveedor);
    } else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      mensajeIngreso('No se pudo entrar. Intente de nuevo.', true);
    }
  }
});
$('#btnSalir').addEventListener('click', salir);
function salir() {
  try { sessionStorage.removeItem(MARCA_SESION); } catch (e) { /* nada */ }
  return signOut(auth);
}
// Cierre automático tras un rato sin usarla (por si deja el teléfono abierto).
let ultimoUso = Date.now();
['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true }));
setInterval(() => {
  if (auth.currentUser && Date.now() - ultimoUso > MINUTOS_INACTIVIDAD * 60000) {
    salir(); mensajeIngreso('Se cerró la sesión por inactividad.');
  }
}, 60000);
function mensajeIngreso(t, mal) { const m = $('#msgIngreso'); m.textContent = t; m.className = 'ingreso-msg' + (mal ? ' mal' : ''); }

onAuthStateChanged(auth, async (u) => {
  $('#btnEntrar').disabled = false;
  // Sesiones guardadas de antes (o de otra pestaña): se cierran y se pide Google de nuevo.
  let marcada = false;
  try { marcada = sessionStorage.getItem(MARCA_SESION) === '1'; } catch (e) { marcada = false; }
  if (u && !marcada) { await signOut(auth); return; }
  const correo = (u && u.email || '').toLowerCase();
  if (u && u.emailVerified && AUTORIZADOS.includes(correo)) {
    $('#pantallaIngreso').hidden = true; $('#pantallaApp').hidden = false;
    $('#usuarioCorreo').textContent = correo;
    iniciarApp();
    return;
  }
  $('#pantallaApp').hidden = true; $('#pantallaIngreso').hidden = false;
  if (u) {
    mensajeIngreso('La cuenta ' + correo + ' no tiene acceso.', true);
    await signOut(auth);
  } else if ($('#msgIngreso').textContent === 'Cargando…') {
    mensajeIngreso('');
  }
});

// ═════════════ PESTAÑAS ═════════════
function mostrar(vista) {
  $('#vistaOrden').hidden = vista !== 'orden';
  $('#vistaHistorial').hidden = vista !== 'historial';
  $('#vistaCalendario').hidden = vista !== 'calendario';
  $('#tabOrden').classList.toggle('activa', vista === 'orden');
  $('#tabHistorial').classList.toggle('activa', vista === 'historial');
  $('#tabCalendario').classList.toggle('activa', vista === 'calendario');
  $('#tabOrden').textContent = idActual ? 'Orden ' + numeroActual : 'Nueva orden';
  if (vista === 'historial') cargarHistorial();
  if (vista === 'calendario') cargarOrdenes().then(pintarCalendario);
  if (vista === 'orden') pintarVista();
  window.scrollTo(0, 0);
}
$('#tabOrden').addEventListener('click', () => mostrar('orden'));
$('#tabHistorial').addEventListener('click', () => mostrar('historial'));
$('#tabCalendario').addEventListener('click', () => mostrar('calendario'));

// ═════════════ FORMULARIO ═════════════
SERVICIOS.concat([OTRO]).forEach((s) => {
  const b = el('button', { type: 'button', class: 'chip', text: '+ ' + s });
  b.addEventListener('click', () => { agregarLinea({ servicio: s === OTRO ? '' : s }); actualizar(); });
  $('#chips').appendChild(b);
});
const dl = el('datalist', { id: 'listaServicios' });
SERVICIOS.forEach((s) => dl.appendChild(el('option', { value: s })));
document.body.appendChild(dl);

function agregarLinea(d = {}) {
  const fila = el('div', { class: 'linea' });
  const campo = (etq, cls, attrs, valor) => {
    const l = el('label', cls ? { class: cls, text: etq } : { text: etq });
    const i = el('input', attrs); i.value = valor; l.appendChild(i); return l;
  };
  const lServ = campo('Servicio', 'servicio', { maxlength: '50', list: 'listaServicios', placeholder: 'Escriba el servicio' }, d.servicio || '');
  const lPara = campo('Para', 'para', { maxlength: '40', placeholder: 'Novia, acompañantes…' }, d.para || '');
  const lCant = campo('Personas', '', { type: 'number', min: '1', max: '200', step: '1', inputmode: 'numeric' }, d.cantidad || 1);
  const lPre = campo('Precio c/u (Q)', '', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0.00' }, d.precio || '');
  const quitar = el('button', { type: 'button', class: 'quitar', 'aria-label': 'Quitar servicio', text: '×' });
  const sub = el('div', { class: 'sub' });
  quitar.addEventListener('click', () => { fila.remove(); actualizar(); });
  [lServ, lPara, lCant, lPre, quitar, sub].forEach((x) => fila.appendChild(x));
  lineas.appendChild(fila);
  if (!d.servicio && d.foco !== false) lServ.querySelector('input').focus();
}

function leerLineas() {
  return [...lineas.querySelectorAll('.linea')].map((f) => {
    const i = f.querySelectorAll('input');
    return { servicio: i[0].value.trim(), para: i[1].value.trim(), cantidad: entero(i[2].value), precio: num(i[3].value), fila: f };
  });
}

// Datos de la orden tal como se guardan en Firestore.
function datosOrden() {
  const f = form.elements; const ls = leerLineas();
  const subtotal = ls.reduce((a, l) => a + l.cantidad * l.precio, 0);
  const domicilio = num(f.traslado.value); const anticipo = num(f.anticipo.value);
  return {
    clienta: f.clienta.value.trim().slice(0, 80),
    telefono: f.telefono.value.trim().slice(0, 20),
    evento: f.evento.value.trim().slice(0, 40),
    lugar: f.lugar.value.trim().slice(0, 60),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(f.fecha.value) ? f.fecha.value : '',
    hora: /^\d{2}:\d{2}$/.test(f.hora.value) ? f.hora.value : '',
    lineas: ls.slice(0, 50).map(({ servicio, para, cantidad, precio }) => ({ servicio: servicio.slice(0, 50), para: para.slice(0, 40), cantidad, precio })),
    domicilio, anticipo,
    nombres: f.nombres.value.split('\n').map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 200),
    clientaPrimera: f.clientaPrimera.checked,
    nota: f.nota.value.trim().slice(0, 300),
    total: Math.round((subtotal + domicilio) * 100) / 100
  };
}

// ── pintar la hoja ──
function poner(clave, texto, pendiente) {
  hoja.querySelectorAll('[data-h="' + clave + '"]').forEach((n) => {
    n.textContent = texto || pendiente || '';
    n.classList.toggle('pendiente', !texto);
  });
}

function actualizar() {
  avisarChoques();
  const f = form.elements;
  const ls = leerLineas();
  const d = datosOrden();
  $('#sinLineas').hidden = ls.length > 0;
  f.numero.value = numeroActual;

  poner('numero', numeroActual ? '#' + numeroActual : 'Nueva');
  poner('emitida', fechaCorta(fechaEmision || new Date()));
  poner('clienta', d.clienta, '—');
  poner('telefono', d.telefono, '—');
  const personas = ls.reduce((a, l) => a + l.cantidad, 0);
  poner('evento', [d.evento, personas ? personas + (personas === 1 ? ' persona' : ' personas') : ''].filter(Boolean).join(' · '), '—');
  poner('servicios', unir([...new Set(ls.map((l) => l.servicio).filter(Boolean))]), '—');
  const hora = horaTexto(d.hora);
  poner('cuando', [fechaLarga(d.fecha), hora ? 'desde las ' + hora : ''].filter(Boolean).join(' · '), '—');
  poner('lugar', d.lugar, '—');
  poner('nota', d.nota, '');
  $('#hNota').hidden = !d.nota;

  const tb = $('#hDetalle'); tb.textContent = '';
  let subtotal = 0;
  ls.forEach((l) => {
    const st = l.cantidad * l.precio; subtotal += st;
    l.fila.querySelector('.sub').textContent = l.cantidad && l.precio ? 'Subtotal: ' + dinero(st) : '';
    const tr = el('tr');
    [[l.servicio || '—'], [l.para || '—'], [String(l.cantidad || 0), 'n'], [l.precio ? dinero(l.precio) : 'Q ______', 'n'], [st ? dinero(st) : 'Q ______', 'n']]
      .forEach(([t, c]) => tr.appendChild(el('td', c ? { class: c, text: t } : { text: t })));
    tb.appendChild(tr);
  });
  if (!ls.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'pendiente', text: 'Agregue los servicios' })]));

  const total = subtotal + d.domicilio;
  const tt = $('#hTotales'); tt.textContent = '';
  const filaTot = (a, b, cls) => tt.appendChild(el('div', cls ? { class: cls } : {}, [el('span', { text: a }), el('span', { text: b })]));
  if (d.domicilio) { filaTot('Servicios', dinero(subtotal)); filaTot('Servicio a domicilio', dinero(d.domicilio)); }
  filaTot('Total', dinero(total), 'g');
  if (d.anticipo) {
    filaTot('Anticipo', dinero(d.anticipo));
    tt.appendChild(el('div', {}, [el('b', { text: 'Saldo pendiente' }), el('b', { text: dinero(Math.max(total - d.anticipo, 0)) })]));
  }
  $('#totalPantalla').textContent = dinero(total);

  const nombres = d.nombres.slice();
  if (d.clientaPrimera && d.clienta) nombres.unshift(d.clienta);
  const tp = $('#hPersonas'); tp.textContent = '';
  let n = 0;
  ls.forEach((l) => {
    for (let i = 0; i < l.cantidad; i++) {
      n++;
      const nombre = nombres[n - 1];
      const celda = el('td');
      if (nombre) {
        celda.appendChild(document.createTextNode(nombre));
        if (/novia/i.test(l.para)) celda.appendChild(el('span', { class: 'novia', text: ' (novia)' }));
      } else celda.appendChild(el('span', { class: 'linea-nombre' }));
      tp.appendChild(el('tr', {}, [el('td', { class: 'c', text: String(n) }), celda,
        el('td', { text: (l.servicio || '—') + (l.precio ? ' · Q ' + l.precio.toLocaleString('en-US') : '') })]));
    }
  });
  $('#hBloquePersonas').hidden = n === 0;

  pintarVista();
}

function pintarVista() {
  const marco = $('#vistaMarco'); const esc = $('#vistaEscala');
  if (!marco.clientWidth) return;
  const copia = hoja.cloneNode(true); copia.removeAttribute('id');
  copia.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  esc.textContent = ''; esc.appendChild(copia);
  const anchoHoja = 816; // 8.5 in a 96 dpi
  const k = Math.min(1, marco.clientWidth / anchoHoja);
  esc.style.transform = 'scale(' + k + ')';
  esc.style.width = anchoHoja + 'px';
  marco.style.height = Math.ceil(copia.offsetHeight * k) + 'px';
}
window.addEventListener('resize', pintarVista);

function cargarEnFormulario(d) {
  const f = form.elements;
  form.reset(); lineas.textContent = '';
  f.nota.value = NOTA_INICIAL;
  if (d) {
    ['clienta', 'telefono', 'evento', 'lugar', 'fecha', 'hora', 'nota'].forEach((k) => { if (typeof d[k] === 'string') f[k].value = d[k]; });
    f.traslado.value = num(d.domicilio) || '';
    f.anticipo.value = num(d.anticipo) || '';
    f.nombres.value = Array.isArray(d.nombres) ? d.nombres.map(String).join('\n') : '';
    if (typeof d.clientaPrimera === 'boolean') f.clientaPrimera.checked = d.clientaPrimera;
    (Array.isArray(d.lineas) ? d.lineas : []).slice(0, 50).forEach((l) => agregarLinea({
      servicio: String(l.servicio || ''), para: String(l.para || ''), cantidad: entero(l.cantidad) || 1, precio: num(l.precio) || '', foco: false
    }));
  }
  actualizar();
}

function nuevaOrden() {
  idActual = null; numeroActual = ''; fechaEmision = null;
  borrarLocal(K_BORRADOR); // borradores de versiones anteriores
  cargarEnFormulario(null);
  mostrar('orden');
}

form.addEventListener('input', actualizar);
form.addEventListener('change', actualizar);
$('#btnNueva').addEventListener('click', () => { borrarLocal(K_BORRADOR); nuevaOrden(); });

// ═════════════ GUARDAR ═════════════
async function guardar() {
  const d = datosOrden();
  if (!d.clienta) { aviso('Escriba el nombre de la clienta.', true); form.elements.clienta.focus(); return false; }
  if (!d.lineas.length) { aviso('Agregue al menos un servicio.', true); return false; }
  const botones = [$('#btnGuardar'), $('#btnPdf')];
  botones.forEach((b) => { b.disabled = true; });
  try {
    if (idActual) {
      await updateDoc(doc(db, 'ordenes', idActual), Object.assign({}, d, { actualizada: serverTimestamp() }));
    } else {
      // Número consecutivo sin repetirse, aunque se use en dos aparatos a la vez.
      const ref = doc(db, 'contadores', 'ordenes');
      const n = await runTransaction(db, async (tx) => {
        const c = await tx.get(ref);
        const actual = c.exists() && Number.isInteger(c.data().siguiente) ? c.data().siguiente : PRIMER_NUMERO;
        tx.set(ref, { siguiente: actual + 1 });
        return actual;
      });
      const numero = 'BR-' + String(n).padStart(4, '0');
      const nueva = await addDoc(collection(db, 'ordenes'), Object.assign({}, d, {
        numero, creada: serverTimestamp(), creadaPor: (auth.currentUser.email || '').toLowerCase()
      }));
      idActual = nueva.id; numeroActual = numero; fechaEmision = new Date();
      borrarLocal(K_BORRADOR);
    }
    actualizar();
    $('#tabOrden').textContent = 'Orden ' + numeroActual;
    aviso('Orden ' + numeroActual + ' guardada.');
    ordenes = []; // forzar recarga del historial
    cargarOrdenes().catch(() => {});
    return true;
  } catch (e) {
    console.error('[Ordenes] Error al guardar', e);
    const codigo = (e && e.code) || (e && e.message) || 'desconocido';
    aviso(codigo === 'permission-denied' ? 'Sin permiso para guardar (permission-denied).' : 'No se pudo guardar: ' + codigo, true);
    return false;
  } finally {
    botones.forEach((b) => { b.disabled = false; });
  }
}
$('#btnGuardar').addEventListener('click', guardar);
$('#btnPdf').addEventListener('click', async () => {
  if (!(await guardar())) return;
  await generarPdf();
});

// ═════════════ PDF ═════════════
// El PDF se arma en el propio navegador (sin "Imprimir"), así funciona igual en el
// teléfono y en la computadora. Las librerías se cargan solo la primera vez.
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
let libsListas = null;
function cargarLibs() {
  if (!libsListas) {
    libsListas = Promise.all(LIBS.map((src) => new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
      s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    }))).catch((e) => { libsListas = null; throw e; });
  }
  return libsListas;
}

let pdfListo = null; // { blob, nombre, img, nombreImg }
async function generarPdf() {
  const btn = $('#btnPdf'); btn.disabled = true;
  aviso('Preparando el PDF…');
  try {
    await cargarLibs();
    actualizar();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // La hoja vive fuera de pantalla; se coloca un momento en la esquina para fotografiarla.
    const antes = hoja.getAttribute('style') || '';
    hoja.setAttribute('style', 'position:absolute;left:0;top:' + window.scrollY + 'px;z-index:-1;');
    let lienzo;
    try {
      lienzo = await window.html2canvas(hoja, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        windowWidth: 816, scrollX: 0, scrollY: -window.scrollY
      });
    } finally {
      hoja.setAttribute('style', antes);
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait', compress: true });
    const anchoPx = lienzo.width; const altoPaginaPx = Math.round(anchoPx * 11 / 8.5);
    for (let y = 0, pag = 0; y < lienzo.height - 2; y += altoPaginaPx, pag++) {
      const alto = Math.min(altoPaginaPx, lienzo.height - y);
      const trozo = document.createElement('canvas');
      trozo.width = anchoPx; trozo.height = alto;
      const ctx = trozo.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, anchoPx, alto);
      ctx.drawImage(lienzo, 0, y, anchoPx, alto, 0, 0, anchoPx, alto);
      if (pag > 0) pdf.addPage('letter', 'portrait');
      pdf.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 8.5, alto * 8.5 / anchoPx);
    }
    // Nombre de archivo solo con letras sin tilde: con tildes algunos teléfonos lo guardan como "download" sin .pdf.
    const nombre = ('Orden_' + (numeroActual || 'nueva') + '_' + form.elements.clienta.value.trim())
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n')
      .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 80) + '.pdf';
    // Versión en imagen (JPG): Instagram y otras apps no aceptan PDF.
    const img = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.92));
    pdfListo = { blob: pdf.output('blob'), nombre, img, nombreImg: nombre.replace(/\.pdf$/, '.jpg') };
    mostrarPanelPdf();
  } catch (e) {
    console.error('[Ordenes] Error al crear el PDF', e);
    aviso('No se pudo crear el PDF. Revise su internet e intente de nuevo.', true);
  } finally {
    btn.disabled = false;
  }
}

// El teléfono solo deja descargar o compartir cuando la persona toca un botón,
// por eso el archivo ya armado se entrega desde este panel.
const UA = navigator.userAgent || '';
const EN_APP = /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i.test(UA);
const ES_ANDROID = /Android/i.test(UA);
const archivoPdf = () => new File([pdfListo.blob], pdfListo.nombre, { type: 'application/pdf' });
const archivoImg = () => new File([pdfListo.img], pdfListo.nombreImg, { type: 'image/jpeg' });
const puedeCompartir = (f) => { try { return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } };

function mostrarPanelPdf() {
  $('#avisoPdfNombre').textContent = pdfListo.nombre;
  $('#btnCompartirPdf').hidden = !puedeCompartir(archivoPdf());
  $('#btnCompartirImg').hidden = !pdfListo.img || !puedeCompartir(archivoImg());
  $('#avisoApp').hidden = !EN_APP;
  $('#btnAbrirChrome').hidden = !(EN_APP && ES_ANDROID);
  $('#panelPdf').hidden = false;
  $('#aviso').hidden = true;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
function abrir(blob) {
  // Plan B: abre el archivo en una pestaña; desde ahí se guarda con el menú del navegador.
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}
async function compartir(archivo) {
  try {
    await navigator.share({ files: [archivo], title: archivo.name });
  } catch (e) {
    if (e && e.name !== 'AbortError') aviso('No se pudo compartir; use Descargar.', true);
  }
}

$('#btnCompartirPdf').addEventListener('click', () => { if (pdfListo) compartir(archivoPdf()); });
$('#btnCompartirImg').addEventListener('click', () => { if (pdfListo) compartir(archivoImg()); });
$('#btnDescargarPdf').addEventListener('click', () => { if (pdfListo) descargar(pdfListo.blob, pdfListo.nombre); });
$('#btnDescargarImg').addEventListener('click', () => { if (pdfListo) descargar(pdfListo.img, pdfListo.nombreImg); });
$('#btnAbrirPdf').addEventListener('click', () => { if (pdfListo) abrir(pdfListo.blob); });
$('#btnAbrirChrome').addEventListener('click', () => {
  // Android: abre esta misma página en Chrome (fuera del navegador de Instagram/WhatsApp).
  location.href = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
});
$('#btnCerrarPdf').addEventListener('click', () => { $('#panelPdf').hidden = true; });

// ═════════════ HISTORIAL ═════════════
// Carga las órdenes una vez y las comparten Historial, Calendario y el aviso de choques.
let cargando = null;
function cargarOrdenes() {
  if (ordenes.length) return Promise.resolve(ordenes);
  if (!cargando) {
    cargando = getDocs(query(collection(db, 'ordenes'), orderBy('creada', 'desc'), limit(500)))
      .then((r) => { ordenes = r.docs.map((x) => Object.assign({ id: x.id }, x.data())); return ordenes; })
      .finally(() => { cargando = null; });
  }
  return cargando;
}
async function cargarHistorial() {
  const estado = $('#histEstado');
  if (!ordenes.length) { estado.hidden = false; estado.textContent = 'Cargando órdenes…'; $('#histLista').textContent = ''; }
  try { await cargarOrdenes(); } catch (e) {
    console.error(e); estado.textContent = 'No se pudo cargar el historial. Revise su internet.'; return;
  }
  pintarHistorial();
}

// Fecha que cuenta para la caja: la del evento; si no tiene, la de creación.
function fechaDe(o) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(o.fecha || '')) { const [a, m, d] = o.fecha.split('-').map(Number); return new Date(a, m - 1, d); }
  return o.creada && o.creada.toDate ? o.creada.toDate() : null;
}
function enPeriodo(o, periodo) {
  if (periodo === 'todo') return true;
  const f = fechaDe(o); if (!f) return false;
  const hoy = new Date();
  if (periodo === 'anio') return f.getFullYear() === hoy.getFullYear();
  const ref = periodo === 'anterior' ? new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1) : hoy;
  return f.getFullYear() === ref.getFullYear() && f.getMonth() === ref.getMonth();
}
const cobradoDe = (o) => o.pagada ? (Number(o.total) || 0) : Math.min(Number(o.anticipo) || 0, Number(o.total) || 0);
let filtroEstado = 'todas';
// Paginación del historial.
const K_POR_PAGINA = 'brinel-por-pagina';
let pagina = 1;
let porPagina = [5, 10, 20, 50].includes(+leer(K_POR_PAGINA)) ? +leer(K_POR_PAGINA) : 10;

function pintarCaja() {
  const periodo = $('#periodo').value;
  const lista = ordenes.filter((o) => enPeriodo(o, periodo));
  const total = lista.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const cobrado = lista.reduce((a, o) => a + cobradoDe(o), 0);
  $('#cajaCobrado').textContent = dinero(cobrado);
  $('#cajaPorCobrar').textContent = dinero(Math.max(total - cobrado, 0));
  $('#cajaTotal').textContent = dinero(total);
  $('#cajaBarra').style.width = (total ? Math.round(cobrado / total * 100) : 0) + '%';
  $('#cajaOrdenes').textContent = lista.length;
  $('#cajaAtendidas').textContent = lista.filter((o) => o.atendida).length;
  $('#cajaPagadas').textContent = lista.filter((o) => o.pagada).length;
}
$('#periodo').addEventListener('change', pintarCaja);
document.querySelectorAll('#histFiltros .filtro').forEach((b) => b.addEventListener('click', () => {
  filtroEstado = b.dataset.f; pagina = 1;
  document.querySelectorAll('#histFiltros .filtro').forEach((x) => x.classList.toggle('activo', x === b));
  pintarHistorial();
}));

// Marca "atendida" o "pagada" y la guarda al momento.
async function marcar(o, campo, valor, casilla) {
  casilla.disabled = true;
  try {
    await updateDoc(doc(db, 'ordenes', o.id), { [campo]: valor, actualizada: serverTimestamp() });
    o[campo] = valor;
    aviso((campo === 'pagada' ? (valor ? 'Marcada como pagada' : 'Marcada como no pagada') : (valor ? 'Marcada como atendida' : 'Marcada como no atendida')) + ' · ' + o.numero);
  } catch (e) {
    console.error('[Ordenes] Error al marcar', e);
    casilla.checked = !valor;
    aviso('No se pudo guardar el cambio: ' + ((e && e.code) || 'error'), true);
  } finally {
    casilla.disabled = false;
    pintarHistorial();
  }
}

function pintarHistorial() {
  pintarCaja();
  const filtro = $('#buscar').value.trim().toLowerCase();
  const lista = $('#histLista'); lista.textContent = '';
  const vis = ordenes.filter((o) => !filtro || [o.numero, o.clienta, o.evento, o.lugar, o.telefono].some((v) => String(v || '').toLowerCase().includes(filtro)))
    .filter((o) => filtroEstado === 'todas' || (filtroEstado === 'porCobrar' && !o.pagada) || (filtroEstado === 'porAtender' && !o.atendida) || (filtroEstado === 'listas' && o.pagada && o.atendida));
  const estado = $('#histEstado');
  estado.hidden = vis.length > 0;
  estado.textContent = ordenes.length ? 'No hay órdenes que coincidan.' : 'Todavía no hay órdenes guardadas.';
  const paginas = Math.max(1, Math.ceil(vis.length / porPagina));
  pagina = Math.min(Math.max(1, pagina), paginas);
  const desde = (pagina - 1) * porPagina;
  $('#paginas').hidden = vis.length === 0;
  $('#pagInfo').textContent = vis.length ? (desde + 1) + '–' + Math.min(desde + porPagina, vis.length) + ' de ' + vis.length : '';
  $('#pagNum').textContent = pagina + ' / ' + paginas;
  $('#pagPrimera').disabled = $('#pagAnterior').disabled = pagina <= 1;
  $('#pagSiguiente').disabled = $('#pagUltima').disabled = pagina >= paginas;
  vis.slice(desde, desde + porPagina).forEach((o) => {
    const creada = o.creada && o.creada.toDate ? fechaCorta(o.creada.toDate()) : '';
    const evento = [o.evento, fechaLarga(o.fecha), o.lugar].filter(Boolean).join(' · ');
    const abrir = el('button', { type: 'button', text: 'Abrir' });
    const pdf = el('button', { type: 'button', text: 'PDF' });
    const borrar = el('button', { type: 'button', class: 'borrar', text: 'Eliminar' });
    abrir.addEventListener('click', () => abrirOrden(o));
    pdf.addEventListener('click', () => { abrirOrden(o); generarPdf(); });
    borrar.addEventListener('click', () => eliminarOrden(o));
    const casilla = (campo, texto) => {
      const c = el('input', { type: 'checkbox' }); c.checked = !!o[campo];
      c.addEventListener('change', () => marcar(o, campo, c.checked, c));
      return el('label', { class: 'marca ' + (o[campo] ? 'si' : 'no') }, [c, document.createTextNode(texto)]);
    };
    const anticipo = !o.pagada && Number(o.anticipo) > 0 ? ' · anticipo ' + dinero(Number(o.anticipo)) : '';
    lista.appendChild(el('div', { class: 'hist-item' + (o.pagada && o.atendida ? ' lista' : '') }, [
      el('div', { class: 't' }, [el('small', { text: String(o.numero || '') }), document.createTextNode(String(o.clienta || ''))]),
      el('div', { class: 'm', text: dinero(Number(o.total) || 0) }),
      el('div', { class: 'd', text: (evento || 'Sin datos del evento') + (creada ? ' · creada ' + creada : '') + anticipo }),
      el('div', { class: 'marcas' }, [casilla('atendida', 'Atendida'), casilla('pagada', 'Pagada')]),
      el('div', { class: 'b' }, [abrir, pdf, botonWhatsApp(o), borrar])
    ]));
  });
}
$('#buscar').addEventListener('input', () => { pagina = 1; pintarHistorial(); });
$('#porPagina').value = String(porPagina);
$('#porPagina').addEventListener('change', () => { porPagina = +$('#porPagina').value; guardarLocal(K_POR_PAGINA, String(porPagina)); pagina = 1; pintarHistorial(); });
const irA = (n) => { pagina = n; pintarHistorial(); $('#vistaHistorial').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#pagPrimera').addEventListener('click', () => irA(1));
$('#pagAnterior').addEventListener('click', () => irA(pagina - 1));
$('#pagSiguiente').addEventListener('click', () => irA(pagina + 1));
$('#pagUltima').addEventListener('click', () => irA(Infinity));

function abrirOrden(o) {
  idActual = o.id; numeroActual = String(o.numero || '');
  fechaEmision = o.creada && o.creada.toDate ? o.creada.toDate() : null;
  cargarEnFormulario(o);
  mostrar('orden');
}

async function eliminarOrden(o) {
  if (!confirm('¿Eliminar la orden ' + o.numero + ' de ' + o.clienta + '? No se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'ordenes', o.id));
    ordenes = ordenes.filter((x) => x.id !== o.id);
    if (idActual === o.id) { idActual = null; numeroActual = ''; }
    pintarHistorial(); aviso('Orden eliminada.');
  } catch (e) { console.error(e); aviso('No se pudo eliminar.', true); }
}

// ═════════════ RECORDATORIO POR WHATSAPP ═════════════
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const UBICACION = 'Barrio El Estadio, Nueva Santa Rosa (esquina, mano izquierda, antes de llegar al Estadio Municipal)';
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const desdeIso = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };

function telefonoWhatsApp(t) {
  let n = String(t || '').replace(/\D/g, '');
  if (n.length === 8) n = '502' + n;           // número de Guatemala sin código de país
  return n.length >= 10 ? n : '';
}
function cuandoTexto(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const d = desdeIso(iso); const hoy = new Date(); const man = new Date(); man.setDate(hoy.getDate() + 1);
  const largo = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  if (iso === isoDe(hoy)) return 'hoy, ' + largo;
  if (iso === isoDe(man)) return 'mañana, ' + largo;
  return 'el ' + largo;
}
function mensajeWhatsApp(o) {
  const nombre = String(o.clienta || '').trim().split(/\s+/)[0] || '';
  const ls = Array.isArray(o.lineas) ? o.lineas : [];
  const servicios = unir([...new Set(ls.map((l) => l.servicio).filter(Boolean))]);
  const personas = ls.reduce((a, l) => a + (Number(l.cantidad) || 0), 0);
  const saldo = o.pagada ? 0 : Math.max((Number(o.total) || 0) - (Number(o.anticipo) || 0), 0);
  const cuando = cuandoTexto(o.fecha); const hora = horaTexto(o.hora);
  return [
    'Hola ' + nombre + ' 💖',
    'Te saludamos de *Brinel Beauty Studio & Academy*.',
    '',
    ('Te recordamos tu cita' + (cuando ? ' ' + cuando : '') + (hora ? ' a las ' + hora.replace(/\u00a0/g, ' ') : '') + '.').replace(/\.\.$/, '.'),
    servicios ? '✨ Servicio: ' + servicios + (personas > 1 ? ' (' + personas + ' personas)' : '') : '',
    '📍 Lugar: ' + (o.lugar || UBICACION),
    saldo ? '💳 Saldo pendiente: ' + dinero(saldo) : '',
    '',
    '¡Te esperamos! Si necesitas cambiar algo, respóndenos por aquí.'
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}
function botonWhatsApp(o) {
  const tel = telefonoWhatsApp(o.telefono);
  const a = el('a', { class: 'btn-wa' + (tel ? '' : ' sin'), target: '_blank', rel: 'noopener', text: 'WhatsApp' });
  if (tel) a.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensajeWhatsApp(o));
  else { a.setAttribute('aria-disabled', 'true'); a.title = 'La orden no tiene teléfono'; a.addEventListener('click', () => aviso('Esta orden no tiene teléfono.', true)); }
  return a;
}

// ═════════════ AVISO DE CHOQUES DE HORARIO ═════════════
function avisarChoques() {
  const caja = $('#avisoChoque'); const f = form.elements;
  const fecha = f.fecha.value;
  const mismas = fecha ? ordenes.filter((o) => o.fecha === fecha && o.id !== idActual) : [];
  if (!mismas.length) { caja.hidden = true; return; }
  mismas.sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')));
  const misma = f.hora.value && mismas.some((o) => o.hora === f.hora.value);
  caja.className = 'ancho choque' + (misma ? ' fuerte' : '');
  caja.textContent = (misma ? '⚠ Ya hay una cita a esa misma hora. ' : 'Ese día ya tiene ' + mismas.length + (mismas.length === 1 ? ' cita: ' : ' citas: ')) +
    mismas.map((o) => (o.hora ? horaTexto(o.hora).replace(/ /g, ' ') : 'sin hora') + ' ' + (o.clienta || '') + ' (' + (o.numero || '') + ')').join(' · ');
  caja.hidden = false;
}

// ═════════════ CALENDARIO ═════════════
let calMes = new Date(); calMes.setDate(1);
let calSel = isoDe(new Date());
function pintarCalendario() {
  $('#calTitulo').textContent = MESES[calMes.getMonth()] + ' ' + calMes.getFullYear();
  const porDia = {};
  ordenes.forEach((o) => { if (/^\d{4}-\d{2}-\d{2}$/.test(o.fecha || '')) (porDia[o.fecha] = porDia[o.fecha] || []).push(o); });
  Object.values(porDia).forEach((l) => l.sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99'))));
  const grid = $('#calGrid'); grid.textContent = '';
  const inicio = new Date(calMes); inicio.setDate(1 - ((calMes.getDay() + 6) % 7)); // lunes de la primera semana
  const hoy = isoDe(new Date());
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    if (i === 35 && d.getMonth() !== calMes.getMonth()) break; // no mostrar una 6.ª semana vacía
    const iso = isoDe(d); const citas = porDia[iso] || [];
    const celda = el('button', { type: 'button', class: 'cal-celda' + (d.getMonth() !== calMes.getMonth() ? ' fuera' : '') + (iso === hoy ? ' hoy' : '') + (iso === calSel ? ' sel' : '') + (citas.length ? ' con' : '') });
    celda.appendChild(el('span', { class: 'cal-num', text: String(d.getDate()) }));
    if (citas.length) {
      celda.appendChild(el('span', { class: 'cal-cuenta', text: String(citas.length) }));
      citas.slice(0, 2).forEach((o) => celda.appendChild(el('span', { class: 'cal-evento' + (o.pagada && o.atendida ? ' listo' : ''), text: (o.hora || '') + ' ' + String(o.clienta || '').split(' ')[0] })));
      if (citas.length > 2) celda.appendChild(el('span', { class: 'cal-mas', text: '+' + (citas.length - 2) + ' más' }));
    }
    celda.addEventListener('click', () => { calSel = iso; pintarCalendario(); $('#calDiaTitulo').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    grid.appendChild(celda);
  }
  pintarDia(porDia[calSel] || []);
}
function pintarDia(citas) {
  const d = desdeIso(calSel);
  $('#calDiaTitulo').textContent = DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1) + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' · ' + (citas.length ? citas.length + (citas.length === 1 ? ' cita' : ' citas') : 'sin citas');
  const lista = $('#calDiaLista'); lista.textContent = '';
  citas.forEach((o) => {
    const abrir = el('button', { type: 'button', text: 'Abrir' }); abrir.addEventListener('click', () => abrirOrden(o));
    const estado = o.pagada ? 'Pagada' : 'Saldo ' + dinero(Math.max((Number(o.total) || 0) - (Number(o.anticipo) || 0), 0));
    lista.appendChild(el('div', { class: 'hist-item' + (o.pagada && o.atendida ? ' lista' : '') }, [
      el('div', { class: 't' }, [el('small', { text: o.hora ? horaTexto(o.hora) : 'Sin hora' }), document.createTextNode(String(o.clienta || ''))]),
      el('div', { class: 'm', text: dinero(Number(o.total) || 0) }),
      el('div', { class: 'd', text: [o.numero, o.evento, o.lugar, estado].filter(Boolean).join(' · ') }),
      el('div', { class: 'b' }, [abrir, botonWhatsApp(o)])
    ]));
  });
  if (!citas.length) {
    const nueva = el('button', { type: 'button', class: 'btn btn-borde', text: '+ Nueva orden para este día' });
    nueva.addEventListener('click', () => { nuevaOrden(); form.elements.fecha.value = calSel; actualizar(); });
    lista.appendChild(el('div', { class: 'cal-vacio' }, [nueva]));
  }
}
$('#calAnterior').addEventListener('click', () => { calMes.setMonth(calMes.getMonth() - 1); pintarCalendario(); });
$('#calSiguiente').addEventListener('click', () => { calMes.setMonth(calMes.getMonth() + 1); pintarCalendario(); });
$('#calHoy').addEventListener('click', () => { calMes = new Date(); calMes.setDate(1); calSel = isoDe(new Date()); pintarCalendario(); });

// ═════════════ INICIO ═════════════
let iniciada = false;
function iniciarApp() {
  if (iniciada) return;
  iniciada = true;
  nuevaOrden();
  cargarOrdenes().then(actualizar).catch(() => {}); // para el aviso de choques
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pintarVista);
}
