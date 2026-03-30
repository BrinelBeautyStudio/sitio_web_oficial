// ══════════════════════════════════════════════════════════════════════════════
//      SCRIPT PRINCIPAL DEL SITIO - BRINEL BEAUTY STUDIO
//      Maneja la lógica de las animaciones, Navbar y Formulario WhatsApp
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. LÓGICA DE REVEAL AL HACER SCROLL ---
    const revealElements = document.querySelectorAll('.reveal');
    const activeRevealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const revealPoint = windowHeight * 0.85;

        revealElements.forEach(element => {
            const revealTop = element.getBoundingClientRect().top;
            if (revealTop < revealPoint) {
                element.classList.add('visible');
            }
        });
    };

    // --- 2. LÓGICA DEL NAVBAR AL HACER SCROLL ---
    const navbar = document.querySelector('.navbar');
    const handleNavbarScroll = () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    // Inicialización y Event Listeners de Scroll
    activeRevealOnScroll();
    handleNavbarScroll();
    window.addEventListener('scroll', activeRevealOnScroll);
    window.addEventListener('scroll', handleNavbarScroll);


    // --- 3. ENVÍO DE FORMULARIO A WHATSAPP ---
    const citaForm = document.getElementById('citaForm');

    if (citaForm) {
        citaForm.addEventListener('submit', function (e) {
            e.preventDefault();

            // A. Validar campos con Bootstrap
            if (!this.checkValidity()) {
                e.stopPropagation();
                this.classList.add('was-validated');
                return;
            }

            // B. Efecto de carga en el botón
            const btn = document.getElementById('btnCita');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Conectando...';

            // C. Captura de datos
            const nombre = document.getElementById('nombreCliente').value;
            const telefono = document.getElementById('telefonoCliente').value;
            const servicio = document.getElementById('servicioCliente').value;
            const fecha = document.getElementById('fechaCliente').value;
            const mensaje = document.getElementById('mensajeCliente').value || "Sin mensaje adicional";

            // D. Configuración de WhatsApp (Guatemala)
            const miNumero = "50255126664";

            // Construcción del mensaje
            const textoWA = `*¡Nueva Solicitud de Cita!* ✨\n\n` +
                `*Cliente:* ${nombre}\n` +
                `*WhatsApp:* ${telefono}\n` +
                `*Servicio:* ${servicio}\n` +
                `*Fecha:* ${fecha}\n` +
                `*Nota:* ${mensaje}`;

            // E. Generar URL (Usamos api.whatsapp para mayor compatibilidad en móviles)
            const url = `https://api.whatsapp.com/send?phone=${miNumero}&text=${encodeURIComponent(textoWA)}`;

            // F. Redirección y Feedback Visual
            // En móviles, es mejor usar location.href para evitar bloqueos de pop-ups
            setTimeout(() => {
                // Abrir WhatsApp
                window.location.href = url;

                // Ocultar formulario y mostrar éxito en la web
                this.style.display = 'none';
                const exitoMsg = document.getElementById('mensajeExito');
                if (exitoMsg) exitoMsg.classList.remove('d-none');
            }, 800);
        });
    }
});