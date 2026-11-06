/* ═════ Generador de órdenes · Brinel Beauty (v2: ingreso con Google + historial) ═════
   - La seguridad real está en las reglas de Firestore (firestore.rules): solo los
     correos autorizados pueden leer o escribir órdenes. La revisión de correo de
     este archivo es solo para mostrar un mensaje claro.
   - Los datos de la clienta solo se escriben en pantalla con textContent (nunca innerHTML). */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, runTransaction, getDocs, getDoc, setDoc, query, orderBy, limit, serverTimestamp }
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
const VISTAS = { orden: 'vistaOrden', calendario: 'vistaCalendario', historial: 'vistaHistorial', clientas: 'vistaClientas', solicitudes: 'vistaSolicitudes', precios: 'vistaPrecios' };
const TABS = { orden: 'tabOrden', calendario: 'tabCalendario', historial: 'tabHistorial', clientas: 'tabClientas', solicitudes: 'tabSolicitudes', precios: 'tabPrecios' };
function mostrar(vista) {
  Object.keys(VISTAS).forEach((k) => { $('#' + VISTAS[k]).hidden = k !== vista; $('#' + TABS[k]).classList.toggle('activa', k === vista); });
  try { $('#' + TABS[vista]).scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* nada */ }
  $('#tabOrden').textContent = idActual ? 'Orden ' + numeroActual : 'Nueva orden';
  if (vista === 'historial') cargarHistorial();
  if (vista === 'calendario') cargarOrdenes().then(pintarCalendario);
  if (vista === 'clientas') cargarOrdenes().then(pintarClientas);
  if (vista === 'solicitudes') cargarSolicitudes();
  if (vista === 'precios') pintarPrecios();
  if (vista === 'orden') pintarVista();
  window.scrollTo(0, 0);
}
$('#tabOrden').addEventListener('click', () => mostrar('orden'));
$('#tabHistorial').addEventListener('click', () => mostrar('historial'));
$('#tabCalendario').addEventListener('click', () => mostrar('calendario'));
$('#tabClientas').addEventListener('click', () => mostrar('clientas'));
$('#tabSolicitudes').addEventListener('click', () => mostrar('solicitudes'));
$('#tabPrecios').addEventListener('click', () => mostrar('precios'));

// ═════════════ FORMULARIO ═════════════
// Catálogo de servicios con precio sugerido (se edita en la pestaña Precios).
let catalogo = SERVICIOS.map((nombre) => ({ nombre, precio: 0 }));
const dl = el('datalist', { id: 'listaServicios' });
document.body.appendChild(dl);
function pintarChips() {
  const chips = $('#chips'); chips.textContent = ''; dl.textContent = '';
  catalogo.concat([{ nombre: OTRO, precio: 0 }]).forEach((c) => {
    const b = el('button', { type: 'button', class: 'chip', text: '+ ' + c.nombre + (c.precio ? ' · Q' + c.precio : '') });
    b.addEventListener('click', () => { agregarLinea(c.nombre === OTRO ? {} : { servicio: c.nombre, precio: c.precio || '' }); actualizar(); });
    chips.appendChild(b);
    if (c.nombre !== OTRO) dl.appendChild(el('option', { value: c.nombre }));
  });
}
pintarChips();
async function cargarCatalogo() {
  try {
    const r = await getDoc(doc(db, 'config', 'servicios'));
    const lista = r.exists() && Array.isArray(r.data().lista) ? r.data().lista : null;
    if (lista && lista.length) { catalogo = lista.map((c) => ({ nombre: String(c.nombre || '').slice(0, 50), precio: num(c.precio) })).filter((c) => c.nombre); pintarChips(); }
  } catch (e) { console.warn('[Ordenes] catálogo', e); }
}

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
  pistaClienta();
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
const limpiarNombre = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n')
  .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 80);

// Fotografía un elemento de tamaño carta y lo convierte en PDF (y JPG).
async function crearPdf(elemento, nombreBase) {
  await cargarLibs();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const antes = elemento.getAttribute('style') || '';
  elemento.setAttribute('style', 'position:absolute;left:0;top:' + window.scrollY + 'px;z-index:-1;');
  let lienzo;
  try {
    lienzo = await window.html2canvas(elemento, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
      windowWidth: 816, scrollX: 0, scrollY: -window.scrollY
    });
  } finally {
    elemento.setAttribute('style', antes);
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
  // Nombre sin tildes: con tildes algunos teléfonos lo guardan como "download" sin .pdf.
  const nombre = limpiarNombre(nombreBase) + '.pdf';
  const img = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.92));
  return { blob: pdf.output('blob'), nombre, img, nombreImg: nombre.replace(/\.pdf$/, '.jpg') };
}

async function generarPdf() {
  const btn = $('#btnPdf'); btn.disabled = true;
  aviso('Preparando el PDF…');
  try {
    actualizar();
    pdfListo = await crearPdf(hoja, 'Orden_' + (numeroActual || 'nueva') + '_' + form.elements.clienta.value.trim());
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
      .then((r) => { ordenes = r.docs.map((x) => Object.assign({ id: x.id }, x.data())); datalistClientas(); return ordenes; })
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
      el('div', { class: 'b' }, [abrir, pdf, botonWhatsApp(o)].concat(o.atendida ? [botonResena(o)] : []).concat([borrar]))
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

// ═════════════ RESEÑA DESPUÉS DEL SERVICIO ═════════════
const REDES = 'Instagram: https://www.instagram.com/brinelbeauty/\nFacebook: https://www.facebook.com/profile.php?id=61559389152870';
function botonResena(o) {
  const tel = telefonoWhatsApp(o.telefono);
  const nombre = String(o.clienta || '').trim().split(/\s+/)[0] || '';
  const texto = 'Hola ' + nombre + ' 💖\nGracias por elegir *Brinel Beauty Studio & Academy*.\n\n' +
    '¿Cómo te sentiste con tu servicio? Nos encantaría leer tu opinión ⭐\n' +
    'Y si tienes fotos de tu look, compártelas y etiquétanos en Instagram *@brinelbeauty* 📸\n\n' + REDES + '\n\n¡Te esperamos pronto!';
  const a = el('a', { class: 'btn-wa resena' + (tel ? '' : ' sin'), target: '_blank', rel: 'noopener', text: 'Pedir reseña' });
  if (tel) a.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(texto);
  else a.addEventListener('click', () => aviso('Esta orden no tiene teléfono.', true));
  return a;
}

// ═════════════ CLIENTAS FRECUENTES ═════════════
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function listaClientas() {
  const mapa = new Map();
  ordenes.forEach((o) => {
    const clave = telefonoWhatsApp(o.telefono) || 'n:' + normal(o.clienta);
    if (clave === 'n:') return;
    const f = fechaDe(o); const c = mapa.get(clave) || { nombre: '', telefono: '', ordenes: [], total: 0, ultima: null };
    c.ordenes.push(o); c.total += Number(o.total) || 0;
    if (!c.ultima || (f && f > c.ultima)) { c.ultima = f; c.nombre = o.clienta || c.nombre; c.telefono = o.telefono || c.telefono; }
    if (!c.nombre) c.nombre = o.clienta; if (!c.telefono) c.telefono = o.telefono || '';
    mapa.set(clave, c);
  });
  return [...mapa.values()].sort((a, b) => (b.ultima || 0) - (a.ultima || 0));
}
function buscarClienta(nombre) {
  const n = normal(nombre); if (!n) return null;
  return listaClientas().find((c) => normal(c.nombre) === n) || null;
}
function pistaClienta() {
  const p = $('#pistaClienta'); const f = form.elements;
  const c = idActual ? null : buscarClienta(f.clienta.value);
  if (!c) { p.hidden = true; return; }
  p.textContent = '💖 Clienta frecuente · ' + c.ordenes.length + (c.ordenes.length === 1 ? ' orden' : ' órdenes') + ' · ' + dinero(c.total) +
    (c.ultima ? ' · última: ' + fechaCorta(c.ultima) : '');
  p.hidden = false;
}
function datalistClientas() {
  const dlc = $('#listaClientas'); dlc.textContent = '';
  listaClientas().slice(0, 300).forEach((c) => dlc.appendChild(el('option', { value: c.nombre }, [])));
}
form.elements.clienta.addEventListener('change', () => {
  const c = buscarClienta(form.elements.clienta.value);
  if (c && !form.elements.telefono.value.trim() && c.telefono) { form.elements.telefono.value = c.telefono; actualizar(); }
});
const K_CLI_POR_PAGINA = 'brinel-cli-por-pagina';
let cliPagina = 1;
let cliPorPagina = [5, 10, 20, 50].includes(+leer(K_CLI_POR_PAGINA)) ? +leer(K_CLI_POR_PAGINA) : 10;
function pintarClientas() {
  const q = normal($('#buscarClienta').value);
  const todas = listaClientas();
  const vis = todas.filter((c) => !q || normal(c.nombre).includes(q) || String(c.telefono).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¬'));
  $('#resumenClientas').textContent = todas.length + (todas.length === 1 ? ' clienta' : ' clientas') + ' en total' + (q ? ' · ' + vis.length + ' coinciden' : '');
  const lista = $('#listaClientasV'); lista.textContent = '';
  const paginas = Math.max(1, Math.ceil(vis.length / cliPorPagina));
  cliPagina = Math.min(Math.max(1, cliPagina), paginas);
  const desde = (cliPagina - 1) * cliPorPagina;
  $('#cliPaginas').hidden = vis.length === 0;
  $('#cliPagInfo').textContent = vis.length ? (desde + 1) + '–' + Math.min(desde + cliPorPagina, vis.length) + ' de ' + vis.length : '';
  $('#cliPagNum').textContent = cliPagina + ' / ' + paginas;
  $('#cliPrimera').disabled = $('#cliAnterior').disabled = cliPagina <= 1;
  $('#cliSiguiente').disabled = $('#cliUltima').disabled = cliPagina >= paginas;
  vis.slice(desde, desde + cliPorPagina).forEach((c) => {
    const nueva = el('button', { type: 'button', text: 'Nueva orden' });
    nueva.addEventListener('click', () => { nuevaOrden(); form.elements.clienta.value = c.nombre; form.elements.telefono.value = c.telefono || ''; actualizar(); });
    const ver = el('button', { type: 'button', text: 'Ver órdenes' });
    ver.addEventListener('click', () => { mostrar('historial'); $('#buscar').value = c.nombre; pagina = 1; pintarHistorial(); });
    const tel = telefonoWhatsApp(c.telefono);
    const wa = el('a', { class: 'btn-wa' + (tel ? '' : ' sin'), target: '_blank', rel: 'noopener', text: 'WhatsApp' });
    if (tel) wa.href = 'https://wa.me/' + tel;
    const pagadas = c.ordenes.filter((o) => o.pagada).length;
    lista.appendChild(el('div', { class: 'hist-item' }, [
      el('div', { class: 't' }, [document.createTextNode(c.nombre)]),
      el('div', { class: 'm', text: dinero(c.total) }),
      el('div', { class: 'd', text: [c.telefono, c.ordenes.length + (c.ordenes.length === 1 ? ' orden' : ' órdenes'), pagadas + ' pagadas', c.ultima ? 'última ' + fechaCorta(c.ultima) : ''].filter(Boolean).join(' · ') }),
      el('div', { class: 'b' }, [nueva, ver, wa])
    ]));
  });
  if (!vis.length) lista.appendChild(el('p', { class: 'vacio', text: todas.length ? 'Ninguna clienta coincide.' : 'Todavía no hay clientas.' }));
}
$('#buscarClienta').addEventListener('input', () => { cliPagina = 1; pintarClientas(); });
$('#cliPorPagina').value = String(cliPorPagina);
$('#cliPorPagina').addEventListener('change', () => { cliPorPagina = +$('#cliPorPagina').value; guardarLocal(K_CLI_POR_PAGINA, String(cliPorPagina)); cliPagina = 1; pintarClientas(); });
const cliIrA = (n) => { cliPagina = n; pintarClientas(); $('#vistaClientas').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#cliPrimera').addEventListener('click', () => cliIrA(1));
$('#cliAnterior').addEventListener('click', () => cliIrA(cliPagina - 1));
$('#cliSiguiente').addEventListener('click', () => cliIrA(cliPagina + 1));
$('#cliUltima').addEventListener('click', () => cliIrA(Infinity));

// ═════════════ SOLICITUDES DE LA PÁGINA ═════════════
let solicitudes = []; let solFiltro = 'nueva';
async function cargarSolicitudes() {
  try {
    const r = await getDocs(query(collection(db, 'solicitudes'), orderBy('creada', 'desc'), limit(200)));
    solicitudes = r.docs.map((x) => Object.assign({ id: x.id }, x.data()));
  } catch (e) { console.warn('[Ordenes] solicitudes', e); $('#solEstado').textContent = 'No se pudieron cargar las solicitudes.'; return; }
  pintarSolicitudes();
}
function pintarSolicitudes() {
  const nuevas = solicitudes.filter((x) => (x.estado || 'nueva') === 'nueva').length;
  $('#insigniaSol').textContent = nuevas; $('#insigniaSol').hidden = !nuevas;
  const vis = solicitudes.filter((x) => (x.estado || 'nueva') === solFiltro);
  const est = $('#solEstado'); est.hidden = vis.length > 0; est.textContent = 'No hay solicitudes aquí.';
  const lista = $('#solLista'); lista.textContent = '';
  vis.forEach((x) => {
    const fechaTxt = /^\d{4}-\d{2}-\d{2}$/.test(x.fecha || '') ? fechaLarga(x.fecha) : 'sin fecha';
    const recibida = x.creada && x.creada.toDate ? fechaCorta(x.creada.toDate()) : '';
    const crear = el('button', { type: 'button', text: 'Crear orden' });
    crear.addEventListener('click', () => convertirSolicitud(x));
    const descartar = el('button', { type: 'button', class: 'borrar', text: 'Descartar' });
    descartar.addEventListener('click', () => cambiarSolicitud(x, 'descartada'));
    const tel = telefonoWhatsApp(x.telefono);
    const wa = el('a', { class: 'btn-wa' + (tel ? '' : ' sin'), target: '_blank', rel: 'noopener', text: 'WhatsApp' });
    if (tel) wa.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola ' + (String(x.nombre || '').split(' ')[0]) + ' 💖\nRecibimos tu solicitud de cita en *Brinel Beauty Studio & Academy* para ' + (x.servicio || 'tu servicio') + (x.fecha ? ' el ' + cuandoTexto(x.fecha).replace(/^el /, '') : '') + '.\n¿A qué hora te queda mejor?');
    const botones = [wa];
    if ((x.estado || 'nueva') !== 'convertida') botones.unshift(crear);
    if ((x.estado || 'nueva') === 'nueva') botones.push(descartar);
    lista.appendChild(el('div', { class: 'hist-item' }, [
      el('div', { class: 't' }, [el('small', { text: x.servicio || '' }), document.createTextNode(String(x.nombre || ''))]),
      el('div', { class: 'm sol-fecha', text: fechaTxt }),
      el('div', { class: 'd', text: [x.telefono, recibida ? 'recibida ' + recibida : '', x.mensaje ? '«' + x.mensaje + '»' : ''].filter(Boolean).join(' · ') }),
      el('div', { class: 'b' }, botones)
    ]));
  });
}
document.querySelectorAll('#solFiltros .filtro').forEach((b) => b.addEventListener('click', () => {
  solFiltro = b.dataset.f;
  document.querySelectorAll('#solFiltros .filtro').forEach((y) => y.classList.toggle('activo', y === b));
  pintarSolicitudes();
}));
async function cambiarSolicitud(x, estado) {
  try { await updateDoc(doc(db, 'solicitudes', x.id), { estado }); x.estado = estado; pintarSolicitudes(); }
  catch (e) { console.error(e); aviso('No se pudo actualizar la solicitud.', true); }
}
function convertirSolicitud(x) {
  nuevaOrden();
  const f = form.elements;
  f.clienta.value = x.nombre || ''; f.telefono.value = x.telefono || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(x.fecha || '')) f.fecha.value = x.fecha;
  const c = catalogo.find((k) => normal(k.nombre) === normal(x.servicio));
  agregarLinea({ servicio: c ? c.nombre : (x.servicio || ''), precio: c ? (c.precio || '') : '', foco: false });
  actualizar();
  cambiarSolicitud(x, 'convertida');
  if (x.mensaje) aviso('Mensaje de la clienta: ' + x.mensaje);
}

// ═════════════ PRECIOS ═════════════
function pintarPrecios() {
  const caja = $('#listaPrecios'); caja.textContent = '';
  catalogo.forEach((c) => filaPrecio(c.nombre, c.precio));
}
function filaPrecio(nombre, precio) {
  const fila = el('div', { class: 'fila-precio' });
  const n = el('input', { maxlength: '50', placeholder: 'Servicio', 'aria-label': 'Servicio' }); n.value = nombre || '';
  const p = el('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: 'Q 0.00', 'aria-label': 'Precio sugerido' }); p.value = precio || '';
  const x = el('button', { type: 'button', class: 'quitar', 'aria-label': 'Quitar', text: '×' });
  x.addEventListener('click', () => fila.remove());
  [n, p, x].forEach((y) => fila.appendChild(y));
  $('#listaPrecios').appendChild(fila);
  return n;
}
$('#btnAgregarServicio').addEventListener('click', () => filaPrecio('', '').focus());
$('#btnGuardarPrecios').addEventListener('click', async () => {
  const lista = [...document.querySelectorAll('#listaPrecios .fila-precio')].map((f) => {
    const i = f.querySelectorAll('input'); return { nombre: i[0].value.trim().slice(0, 50), precio: num(i[1].value) };
  }).filter((c) => c.nombre).slice(0, 60);
  if (!lista.length) { aviso('Agregue al menos un servicio.', true); return; }
  const b = $('#btnGuardarPrecios'); b.disabled = true;
  try {
    await setDoc(doc(db, 'config', 'servicios'), { lista, actualizada: serverTimestamp() });
    catalogo = lista; pintarChips(); pintarPrecios(); aviso('Precios guardados.');
  } catch (e) { console.error(e); aviso('No se pudo guardar: ' + ((e && e.code) || 'error'), true); }
  finally { b.disabled = false; }
});

// ═════════════ REPORTES ═════════════
function ordenesDelPeriodo() { const p = $('#periodo').value; return ordenes.filter((o) => enPeriodo(o, p)); }
const textoPeriodo = () => { const s = $('#periodo'); const t = s.options[s.selectedIndex].text; const hoy = new Date();
  if (s.value === 'mes') return MESES[hoy.getMonth()] + ' ' + hoy.getFullYear();
  if (s.value === 'anterior') { const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); return MESES[d.getMonth()] + ' ' + d.getFullYear(); }
  if (s.value === 'anio') return 'año ' + hoy.getFullYear();
  return t; };
$('#btnExcel').addEventListener('click', () => {
  const lista = ordenesDelPeriodo();
  if (!lista.length) { aviso('No hay órdenes en ese periodo.', true); return; }
  const esc = (t) => '"' + String(t == null ? '' : t).replace(/"/g, '""') + '"';
  const filas = [['Número', 'Fecha evento', 'Hora', 'Clienta', 'Teléfono', 'Evento', 'Lugar', 'Servicios', 'Personas', 'Total', 'Anticipo', 'Pagada', 'Atendida']];
  lista.forEach((o) => {
    const ls = Array.isArray(o.lineas) ? o.lineas : [];
    filas.push([o.numero, o.fecha, o.hora, o.clienta, o.telefono, o.evento, o.lugar,
      [...new Set(ls.map((l) => l.servicio).filter(Boolean))].join(', '), ls.reduce((a, l) => a + (Number(l.cantidad) || 0), 0),
      (Number(o.total) || 0).toFixed(2), (Number(o.anticipo) || 0).toFixed(2), o.pagada ? 'Sí' : 'No', o.atendida ? 'Sí' : 'No']);
  });
  const csv = '﻿' + filas.map((f) => f.map(esc).join(',')).join('\r\n');
  descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), limpiarNombre('Ordenes_' + textoPeriodo()) + '.csv');
});
$('#btnReporte').addEventListener('click', async () => {
  const lista = ordenesDelPeriodo();
  if (!lista.length) { aviso('No hay órdenes en ese periodo.', true); return; }
  const r = $('#hojaReporte'); r.textContent = '';
  const total = lista.reduce((a, o) => a + (Number(o.total) || 0), 0);
  const cobrado = lista.reduce((a, o) => a + cobradoDe(o), 0);
  const cab = el('div', { class: 'cab' }, [
    el('img', { src: 'images/logos/logo_brinel_circular.png', alt: '' }),
    el('div', {}, [el('h1', { text: 'Reporte de órdenes' }), el('p', { text: 'Brinel Beauty Studio & Academy' })]),
    el('div', { class: 'num' }, [el('span', { text: 'Periodo' }), el('b', { text: textoPeriodo() }), el('span', { text: 'Generado ' + fechaCorta(new Date()) })])
  ]);
  const kpi = (t, v) => el('div', {}, [el('small', { text: t }), el('b', { text: v })]);
  const tabla = (cabeza, filas, numCols) => {
    const t = el('table'); const th = el('tr');
    cabeza.forEach((c, i) => th.appendChild(el('th', numCols.includes(i) ? { class: 'n', text: c } : { text: c })));
    t.appendChild(el('thead', {}, [th])); const tb = el('tbody');
    filas.forEach((f) => { const tr = el('tr'); f.forEach((c, i) => tr.appendChild(el('td', numCols.includes(i) ? { class: 'n', text: c } : { text: c }))); tb.appendChild(tr); });
    t.appendChild(tb); return t;
  };
  const serv = {};
  lista.forEach((o) => (o.lineas || []).forEach((l) => { const k = l.servicio || 'Otro'; serv[k] = serv[k] || { p: 0, q: 0 }; serv[k].p += Number(l.cantidad) || 0; serv[k].q += (Number(l.cantidad) || 0) * (Number(l.precio) || 0); }));
  const cli = {};
  lista.forEach((o) => { const k = o.clienta || '—'; cli[k] = cli[k] || { n: 0, q: 0 }; cli[k].n++; cli[k].q += Number(o.total) || 0; });
  const ordenadas = lista.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  const cuerpo = el('div', { class: 'cuerpo' }, [
    el('div', { class: 'rep-kpis' }, [kpi('Total en órdenes', dinero(total)), kpi('Cobrado', dinero(cobrado)), kpi('Por cobrar', dinero(Math.max(total - cobrado, 0))),
      kpi('Órdenes', lista.length + ' · ' + lista.filter((o) => o.pagada).length + ' pagadas')]),
    el('h2', { text: 'Servicios más vendidos' }),
    tabla(['Servicio', 'Personas', 'Ingreso'], Object.entries(serv).sort((a, b) => b[1].q - a[1].q).slice(0, 10).map(([k, v]) => [k, String(v.p), dinero(v.q)]), [1, 2]),
    el('h2', { text: 'Mejores clientas' }),
    tabla(['Clienta', 'Órdenes', 'Total'], Object.entries(cli).sort((a, b) => b[1].q - a[1].q).slice(0, 5).map(([k, v]) => [k, String(v.n), dinero(v.q)]), [1, 2]),
    el('h2', { text: 'Órdenes del periodo' }),
    tabla(['No.', 'Fecha', 'Clienta', 'Estado', 'Total'], ordenadas.map((o) => [o.numero || '', o.fecha ? fechaCorta(desdeIso(o.fecha)) : '—', o.clienta || '',
      (o.atendida ? 'Atendida' : 'Pendiente') + ' · ' + (o.pagada ? 'Pagada' : 'Por cobrar'), dinero(Number(o.total) || 0)]), [4])
  ]);
  r.appendChild(cab); r.appendChild(cuerpo); r.appendChild(el('div', { class: 'pie', text: 'Brinel Beauty Studio & Academy · Reporte interno' }));
  const b = $('#btnReporte'); b.disabled = true; aviso('Preparando el reporte…');
  try { pdfListo = await crearPdf(r, 'Reporte_Brinel_' + textoPeriodo()); mostrarPanelPdf(); }
  catch (e) { console.error(e); aviso('No se pudo crear el reporte.', true); }
  finally { b.disabled = false; }
});

// ═════════════ INSTALAR COMO APP ═════════════
// Android/Chrome ofrece instalar; en iPhone se explica cómo agregarla a la pantalla de inicio.
let promptInstalar = null;
const yaInstalada = window.matchMedia('(display-mode: minimal-ui), (display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; if (!yaInstalada) $('#btnInstalar').hidden = false; });
$('#btnInstalar').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  try { await promptInstalar.userChoice; } catch (e) { /* nada */ }
  promptInstalar = null; $('#btnInstalar').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#btnInstalar').hidden = true; aviso('Listo: ya está en la pantalla de inicio.'); });
if (!yaInstalada && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  $('#ayudaInstalar').textContent = 'Para tenerla como app: toque Compartir (□↑) y luego «Agregar a inicio».';
  $('#ayudaInstalar').hidden = false;
}

// ═════════════ INICIO ═════════════
let iniciada = false;
function iniciarApp() {
  if (iniciada) return;
  iniciada = true;
  nuevaOrden();
  cargarOrdenes().then(() => { datalistClientas(); actualizar(); }).catch(() => {}); // choques y clientas
  cargarCatalogo();
  cargarSolicitudes();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pintarVista);
}
