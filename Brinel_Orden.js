/* ═════ Generador de órdenes · Brinel Beauty ═════
   Todo ocurre en el navegador: no se envía nada a ningún servidor.
   Los datos de la clienta solo se escriben con textContent (nunca innerHTML). */
(function () {
  'use strict';

  // Catálogo: para agregar un servicio, agréguelo a esta lista.
  const SERVICIOS = [
    'Maquillaje y peinado', 'Maquillaje social', 'Maquillaje natural', 'Maquillaje express',
    'Peinado', 'Corte', 'Tinte', 'Uñas', 'Diseño de cejas', 'Micropigmentación', 'Extensiones de pestañas'
  ];
  const OTRO = 'Otro…';
  const NOTA_INICIAL = 'cambios de horario o número de personas, avisar con anticipación. Presente este número de orden el día del evento.';
  const K_SIGUIENTE = 'brinel-orden-siguiente';
  const K_BORRADOR = 'brinel-orden-borrador';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#formOrden');
  const hoja = $('#hoja');
  const lineas = $('#lineas');

  // ── almacenamiento local (puede no estar disponible: modo privado) ──
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const borrar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } };

  const siguienteNumero = () => {
    const n = parseInt(leer(K_SIGUIENTE) || '160', 10);
    return 'BR-' + String(Number.isFinite(n) ? n : 160).padStart(4, '0');
  };

  // ── utilidades ──
  const dinero = (n) => 'Q ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const entero = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 0; };
  const hoyTexto = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  const fechaLarga = (iso) => { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return p ? (+p[3]) + ' de ' + MESES[+p[2] - 1] + ' de ' + p[1] : ''; };
  const horaTexto = (hm) => {
    const p = /^(\d{2}):(\d{2})$/.exec(hm || ''); if (!p) return '';
    let h = +p[1]; const ap = h < 12 ? 'a. m.' : 'p. m.'; h = h % 12 || 12;
    return h + ':' + p[2] + ' ' + ap;
  };
  const unir = (lista) => lista.length <= 1 ? (lista[0] || '') : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  const el = (tag, props = {}, hijos = []) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); });
    hijos.forEach((h) => e.appendChild(h));
    return e;
  };

  // ── chips de servicios ──
  SERVICIOS.concat([OTRO]).forEach((s) => {
    const b = el('button', { type: 'button', class: 'chip', text: '+ ' + s });
    b.addEventListener('click', () => { agregarLinea({ servicio: s === OTRO ? '' : s }); actualizar(); });
    $('#chips').appendChild(b);
  });

  // ── líneas de la orden ──
  function agregarLinea(d = {}) {
    const fila = el('div', { class: 'linea' });
    const lServ = el('label', { class: 'servicio', text: 'Servicio' });
    const iServ = el('input', { maxlength: '50', list: 'listaServicios', placeholder: 'Escriba el servicio' });
    iServ.value = d.servicio || '';
    lServ.appendChild(iServ);
    const lPara = el('label', { class: 'para', text: 'Para' });
    const iPara = el('input', { maxlength: '40', placeholder: 'Novia, acompañantes…' });
    iPara.value = d.para || '';
    lPara.appendChild(iPara);
    const lCant = el('label', { text: 'Personas' });
    const iCant = el('input', { type: 'number', min: '1', max: '200', step: '1', inputmode: 'numeric' });
    iCant.value = d.cantidad || 1;
    lCant.appendChild(iCant);
    const lPre = el('label', { text: 'Precio c/u (Q)' });
    const iPre = el('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0.00' });
    iPre.value = d.precio || '';
    lPre.appendChild(iPre);
    const quitar = el('button', { type: 'button', class: 'quitar', 'aria-label': 'Quitar servicio', text: '×' });
    const sub = el('div', { class: 'sub' });
    quitar.addEventListener('click', () => { fila.remove(); actualizar(); });
    [lServ, lPara, lCant, lPre, quitar, sub].forEach((x) => fila.appendChild(x));
    lineas.appendChild(fila);
    if (!d.servicio) iServ.focus();
  }
  const dl = el('datalist', { id: 'listaServicios' });
  SERVICIOS.forEach((s) => dl.appendChild(el('option', { value: s })));
  document.body.appendChild(dl);

  function leerLineas() {
    return [...lineas.querySelectorAll('.linea')].map((f) => {
      const i = f.querySelectorAll('input');
      return { servicio: i[0].value.trim(), para: i[1].value.trim(), cantidad: entero(i[2].value), precio: num(i[3].value), fila: f };
    });
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
    $('#sinLineas').hidden = ls.length > 0;

    poner('numero', '#' + (f.numero.value.trim() || siguienteNumero()));
    poner('emitida', hoyTexto());
    poner('clienta', f.clienta.value.trim(), '—');
    poner('telefono', f.telefono.value.trim(), '—');
    const personasTot = ls.reduce((a, l) => a + l.cantidad, 0);
    const evento = f.evento.value.trim();
    poner('evento', [evento, personasTot ? personasTot + (personasTot === 1 ? ' persona' : ' personas') : ''].filter(Boolean).join(' · '), '—');
    poner('servicios', unir([...new Set(ls.map((l) => l.servicio).filter(Boolean))]), '—');
    const fecha = fechaLarga(f.fecha.value); const hora = horaTexto(f.hora.value);
    poner('cuando', [fecha, hora ? 'desde las ' + hora : ''].filter(Boolean).join(' · '), '—');
    poner('lugar', f.lugar.value.trim(), '—');
    poner('nota', f.nota.value.trim(), '');
    $('#hNota').hidden = !f.nota.value.trim();

    // detalle
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

    // totales
    const domicilio = num(f.traslado.value); const anticipo = num(f.anticipo.value);
    const total = subtotal + domicilio;
    const tt = $('#hTotales'); tt.textContent = '';
    const filaTot = (a, b, cls) => tt.appendChild(el('div', cls ? { class: cls } : {}, [el('span', { text: a }), el('span', { text: b })]));
    if (domicilio) { filaTot('Servicios', dinero(subtotal)); filaTot('Servicio a domicilio', dinero(domicilio)); }
    filaTot('Total', dinero(total), 'g');
    if (anticipo) {
      filaTot('Anticipo', dinero(anticipo));
      const s = el('div', {}, [el('b', { text: 'Saldo pendiente' }), el('b', { text: dinero(Math.max(total - anticipo, 0)) })]);
      tt.appendChild(s);
    }
    $('#totalPantalla').textContent = dinero(total);

    // personas
    const nombres = f.nombres.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (f.clientaPrimera.checked && f.clienta.value.trim()) nombres.unshift(f.clienta.value.trim());
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
        const tr = el('tr', {}, [el('td', { class: 'c', text: String(n) }), celda,
          el('td', { text: (l.servicio || '—') + (l.precio ? ' · Q ' + l.precio.toLocaleString('en-US') : '') })]);
        tp.appendChild(tr);
      }
    });
    $('#hBloquePersonas').hidden = n === 0;

    pintarVista();
    guardarBorrador(ls);
  }

  // ── vista previa escalada al ancho disponible ──
  function pintarVista() {
    const marco = $('#vistaMarco'); const esc = $('#vistaEscala');
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

  // ── borrador automático ──
  function guardarBorrador(ls) {
    const f = form.elements; const d = {};
    ['clienta', 'telefono', 'numero', 'evento', 'lugar', 'fecha', 'hora', 'traslado', 'anticipo', 'nombres', 'nota'].forEach((k) => { d[k] = f[k].value; });
    d.clientaPrimera = f.clientaPrimera.checked;
    d.lineas = ls.map(({ servicio, para, cantidad, precio }) => ({ servicio, para, cantidad, precio }));
    guardar(K_BORRADOR, JSON.stringify(d));
  }
  function cargar(d) {
    const f = form.elements;
    form.reset(); lineas.textContent = '';
    f.numero.value = siguienteNumero();
    f.nota.value = NOTA_INICIAL;
    if (d) {
      Object.keys(d).forEach((k) => { if (f[k] && typeof d[k] === 'string') f[k].value = d[k]; });
      if (typeof d.clientaPrimera === 'boolean') f.clientaPrimera.checked = d.clientaPrimera;
      (Array.isArray(d.lineas) ? d.lineas : []).slice(0, 50).forEach((l) => agregarLinea({
        servicio: String(l.servicio || ''), para: String(l.para || ''), cantidad: entero(l.cantidad) || 1, precio: num(l.precio) || ''
      }));
    }
    actualizar();
  }

  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);

  $('#btnNueva').addEventListener('click', () => {
    if (form.elements.clienta.value.trim() && !confirm('¿Empezar una orden nueva? Se borrarán los datos de esta pantalla.')) return;
    borrar(K_BORRADOR); cargar(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── PDF: se imprime solo la hoja (Guardar como PDF) ──
  let numeroImpreso = null;
  $('#btnPdf').addEventListener('click', () => {
    const f = form.elements;
    if (!f.clienta.value.trim()) { alert('Escriba el nombre de la clienta.'); f.clienta.focus(); return; }
    if (!leerLineas().length) { alert('Agregue al menos un servicio.'); return; }
    actualizar();
    const numero = f.numero.value.trim() || siguienteNumero();
    numeroImpreso = numero;
    const tituloAntes = document.title;
    document.title = ('Orden_' + numero + '_' + f.clienta.value.trim()).replace(/[^\p{L}\p{N}_-]+/gu, '_');
    window.print();
    setTimeout(() => { document.title = tituloAntes; }, 1000);
  });
  window.addEventListener('afterprint', () => {
    // Si se usó el número sugerido, el siguiente queda listo para la próxima orden.
    if (numeroImpreso && numeroImpreso === siguienteNumero()) {
      guardar(K_SIGUIENTE, String(parseInt(numeroImpreso.replace(/\D/g, ''), 10) + 1));
    }
    numeroImpreso = null;
  });

  // ── inicio ──
  let borrador = null;
  try { borrador = JSON.parse(leer(K_BORRADOR) || 'null'); } catch (e) { borrador = null; }
  cargar(borrador && typeof borrador === 'object' ? borrador : null);
  if (!borrador) agregarLinea({ servicio: 'Maquillaje y peinado' });
  actualizar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(pintarVista);
})();
