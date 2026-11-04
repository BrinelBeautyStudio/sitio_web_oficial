/* ═════ Generador de órdenes · Brinel Beauty (v2: ingreso con Google + historial) ═════
   - La seguridad real está en las reglas de Firestore (firestore.rules): solo los
     correos autorizados pueden leer o escribir órdenes. La revisión de correo de
     este archivo es solo para mostrar un mensaje claro.
   - Los datos de la clienta solo se escriben en pantalla con textContent (nunca innerHTML). */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged }
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
$('#btnSalir').addEventListener('click', () => signOut(auth));
function mensajeIngreso(t, mal) { const m = $('#msgIngreso'); m.textContent = t; m.className = 'ingreso-msg' + (mal ? ' mal' : ''); }

onAuthStateChanged(auth, async (u) => {
  $('#btnEntrar').disabled = false;
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
  $('#tabOrden').classList.toggle('activa', vista === 'orden');
  $('#tabHistorial').classList.toggle('activa', vista === 'historial');
  $('#tabOrden').textContent = idActual ? 'Orden ' + numeroActual : 'Nueva orden';
  if (vista === 'historial') cargarHistorial();
  if (vista === 'orden') pintarVista();
  window.scrollTo(0, 0);
}
$('#tabOrden').addEventListener('click', () => mostrar('orden'));
$('#tabHistorial').addEventListener('click', () => mostrar('historial'));

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
  if (!idActual) guardarLocal(K_BORRADOR, JSON.stringify(d));
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
  if (!lineas.children.length) agregarLinea({ servicio: 'Maquillaje y peinado' });
  actualizar();
}

function nuevaOrden() {
  idActual = null; numeroActual = ''; fechaEmision = null;
  let borrador = null;
  try { borrador = JSON.parse(leer(K_BORRADOR) || 'null'); } catch (e) { borrador = null; }
  cargarEnFormulario(borrador && typeof borrador === 'object' ? borrador : null);
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
    return true;
  } catch (e) {
    console.error(e);
    aviso(e && e.code === 'permission-denied' ? 'Su cuenta no tiene permiso para guardar.' : 'No se pudo guardar. Revise su internet e intente de nuevo.', true);
    return false;
  } finally {
    botones.forEach((b) => { b.disabled = false; });
  }
}
$('#btnGuardar').addEventListener('click', guardar);
$('#btnPdf').addEventListener('click', async () => {
  if (!(await guardar())) return;
  const tituloAntes = document.title;
  document.title = ('Orden_' + numeroActual + '_' + form.elements.clienta.value.trim()).replace(/[^\p{L}\p{N}_-]+/gu, '_');
  window.print();
  setTimeout(() => { document.title = tituloAntes; }, 1000);
});

// ═════════════ HISTORIAL ═════════════
async function cargarHistorial() {
  const estado = $('#histEstado');
  if (!ordenes.length) {
    estado.hidden = false; estado.textContent = 'Cargando órdenes…'; $('#histLista').textContent = '';
    try {
      const r = await getDocs(query(collection(db, 'ordenes'), orderBy('creada', 'desc'), limit(300)));
      ordenes = r.docs.map((x) => Object.assign({ id: x.id }, x.data()));
    } catch (e) {
      console.error(e); estado.textContent = 'No se pudo cargar el historial. Revise su internet.'; return;
    }
  }
  pintarHistorial();
}

function pintarHistorial() {
  const filtro = $('#buscar').value.trim().toLowerCase();
  const lista = $('#histLista'); lista.textContent = '';
  const vis = ordenes.filter((o) => !filtro || [o.numero, o.clienta, o.evento, o.lugar, o.telefono].some((v) => String(v || '').toLowerCase().includes(filtro)));
  const estado = $('#histEstado');
  estado.hidden = vis.length > 0;
  estado.textContent = ordenes.length ? 'No hay órdenes que coincidan.' : 'Todavía no hay órdenes guardadas.';
  vis.forEach((o) => {
    const creada = o.creada && o.creada.toDate ? fechaCorta(o.creada.toDate()) : '';
    const evento = [o.evento, fechaLarga(o.fecha), o.lugar].filter(Boolean).join(' · ');
    const abrir = el('button', { type: 'button', text: 'Abrir' });
    const pdf = el('button', { type: 'button', text: 'PDF' });
    const borrar = el('button', { type: 'button', class: 'borrar', text: 'Eliminar' });
    abrir.addEventListener('click', () => abrirOrden(o));
    pdf.addEventListener('click', () => { abrirOrden(o); setTimeout(() => $('#btnPdf').click(), 300); });
    borrar.addEventListener('click', () => eliminarOrden(o));
    lista.appendChild(el('div', { class: 'hist-item' }, [
      el('div', { class: 't' }, [el('small', { text: String(o.numero || '') }), document.createTextNode(String(o.clienta || ''))]),
      el('div', { class: 'm', text: dinero(Number(o.total) || 0) }),
      el('div', { class: 'd', text: (evento || 'Sin datos del evento') + (creada ? ' · creada ' + creada : '') }),
      el('div', { class: 'b' }, [abrir, pdf, borrar])
    ]));
  });
}
$('#buscar').addEventListener('input', pintarHistorial);

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

// ═════════════ INICIO ═════════════
let iniciada = false;
function iniciarApp() {
  if (iniciada) return;
  iniciada = true;
  nuevaOrden();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pintarVista);
}
