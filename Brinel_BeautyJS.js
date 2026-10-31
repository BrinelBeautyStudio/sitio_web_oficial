// ══════════════════════════════════════════════════════════════
//   BRINEL BEAUTY STUDIO & ACADEMY – SCRIPT PRINCIPAL (versión 2)
// ══════════════════════════════════════════════════════════════

// ── CONFIGURACIÓN ──
const WHATSAPP = '50255126664';                  // número de Brinel (502 + 8 dígitos)
const CORREO_DEV = 'mjcontrolsystems@gmail.com'; // correo del desarrollador (footer)

// ── FOTOS DE LA GALERÍA (en el orden en que se muestran) ──
const FOTOS_GALERIA = [
    'trabajo5', 'trabajo12', 'trabajo10', 'maquillaje3', 'trabajo6', 'trabajo2',
    'peinado1', 'trabajo7', 'trabajo4', 'trabajo1', 'planchado1', 'trabajo9',
    'trabajo11', 'maquillaje5', 'trabajo8', 'trabajo3', 'pestanas1', 'maq_natural'
].map(n => `images/web/${n}.jpg`);

const linkWhatsApp = (texto) =>
    `https://api.whatsapp.com/send?phone=${WHATSAPP}&text=${encodeURIComponent(texto)}`;

document.addEventListener('DOMContentLoaded', () => {

    // 1. Enlaces de WhatsApp y correo
    const saludo = linkWhatsApp('Hola Brinel Beauty, quiero información sobre un servicio o producto.');
    document.querySelectorAll('.lnk-wa').forEach(a => { a.href = saludo; a.target = '_blank'; a.rel = 'noopener'; });

    document.querySelectorAll('[data-servicio]').forEach(btn => {
        btn.href = linkWhatsApp(`Hola! Quiero agendar: ${btn.dataset.servicio}`);
        btn.target = '_blank';
        btn.rel = 'noopener';
    });

    document.getElementById('btnAcademia').href = linkWhatsApp('Hola! Quiero información sobre los cursos de la academia.');
    document.getElementById('btnAcademia').target = '_blank';

    document.getElementById('lnkDev').href =
        'https://mail.google.com/mail/?view=cm&fs=1' +
        `&to=${encodeURIComponent(CORREO_DEV)}` +
        `&su=${encodeURIComponent('Quiero una página web para mi negocio')}` +
        `&body=${encodeURIComponent('Hola MJ Control Systems, vi la página de Brinel Beauty y me interesa una página web. ')}`;

    document.getElementById('anio').textContent = new Date().getFullYear();

    // 2. Navbar: cambia a blanca al bajar
    const navbar = document.getElementById('navbar');
    const actualizarNavbar = () => navbar.classList.toggle('scrolled', window.scrollY > 60);
    actualizarNavbar();
    window.addEventListener('scroll', actualizarNavbar, { passive: true });

    // 3. Cerrar el menú en celular al tocar un enlace
    const menu = document.getElementById('navMenu');
    const collapse = new bootstrap.Collapse(menu, { toggle: false });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        if (menu.classList.contains('show')) collapse.hide();
    }));
    // Si se abre el menú arriba del todo, la navbar se pone blanca para que se lea
    menu.addEventListener('show.bs.collapse', () => navbar.classList.add('scrolled'));
    menu.addEventListener('hidden.bs.collapse', actualizarNavbar);

    // 4. Fotos que rotan en el hero
    const fotosHero = document.querySelectorAll('#heroRotativo img');
    let fotoActual = 0;
    setInterval(() => {
        fotosHero[fotoActual].classList.remove('activa');
        fotoActual = (fotoActual + 1) % fotosHero.length;
        fotosHero[fotoActual].classList.add('activa');
    }, 4500);

    // 5. Animación al aparecer en pantalla
    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visible'); observador.unobserve(e.target); }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => observador.observe(el));

    // 6. Filtro de servicios
    document.querySelectorAll('.filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.filtro.activo').classList.remove('activo');
            btn.classList.add('activo');
            const filtro = btn.dataset.filtro;
            document.querySelectorAll('.servicio').forEach(s => {
                s.classList.toggle('oculto', filtro !== 'todos' && s.dataset.cat !== filtro);
            });
        });
    });

    // 7. Galería + visor
    const grid = document.getElementById('galeria-grid');
    FOTOS_GALERIA.forEach((src, i) => {
        const div = document.createElement('div');
        div.className = 'galeria-item reveal';
        div.innerHTML = `<img src="${src}" alt="Trabajo de Brinel Beauty ${i + 1}" loading="lazy">`;
        div.addEventListener('click', () => abrirVisor(i));
        grid.appendChild(div);
        observador.observe(div);
    });

    const visor = document.getElementById('visor');
    const visorImg = document.getElementById('visorImg');
    const contador = document.getElementById('visorContador');
    let actual = 0;

    const abrirVisor = (i) => {
        actual = (i + FOTOS_GALERIA.length) % FOTOS_GALERIA.length;
        visorImg.src = FOTOS_GALERIA[actual];
        contador.textContent = `${actual + 1} / ${FOTOS_GALERIA.length}`;
        visor.classList.add('abierto');
        visor.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
    const cerrarVisor = () => {
        visor.classList.remove('abierto');
        visor.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    document.getElementById('visorPrev').addEventListener('click', e => { e.stopPropagation(); abrirVisor(actual - 1); });
    document.getElementById('visorNext').addEventListener('click', e => { e.stopPropagation(); abrirVisor(actual + 1); });
    document.getElementById('visorCerrar').addEventListener('click', cerrarVisor);
    visor.addEventListener('click', e => { if (e.target === visor) cerrarVisor(); });
    document.addEventListener('keydown', e => {
        if (!visor.classList.contains('abierto')) return;
        if (e.key === 'Escape') cerrarVisor();
        if (e.key === 'ArrowLeft') abrirVisor(actual - 1);
        if (e.key === 'ArrowRight') abrirVisor(actual + 1);
    });

    // Deslizar con el dedo en el visor (celular)
    let toqueX = null;
    visor.addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; }, { passive: true });
    visor.addEventListener('touchend', e => {
        if (toqueX === null) return;
        const dx = e.changedTouches[0].clientX - toqueX;
        if (Math.abs(dx) > 50) abrirVisor(actual + (dx < 0 ? 1 : -1));
        toqueX = null;
    });

    // 8. Formulario de cita → WhatsApp
    const fecha = document.getElementById('fechaCliente');
    fecha.min = new Date().toISOString().split('T')[0];   // no permite fechas pasadas

    document.getElementById('citaForm').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!this.checkValidity()) { this.classList.add('was-validated'); return; }

        const v = id => document.getElementById(id).value.trim();
        const texto =
            `*¡Nueva solicitud de cita!*\n\n` +
            `*Cliente:* ${v('nombreCliente')}\n` +
            `*WhatsApp:* ${v('telefonoCliente')}\n` +
            `*Servicio:* ${v('servicioCliente')}\n` +
            `*Fecha:* ${v('fechaCliente')}\n` +
            `*Nota:* ${v('mensajeCliente') || 'Sin mensaje adicional'}`;

        const btn = document.getElementById('btnCita');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Abriendo WhatsApp...';

        setTimeout(() => {
            window.open(linkWhatsApp(texto), '_blank');
            this.classList.add('d-none');
            document.getElementById('mensajeExito').classList.remove('d-none');
        }, 600);
    });
});
