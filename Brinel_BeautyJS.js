// ══════════════════════════════════════════════════════════════════════════════
//      SCRIPT PRINCIPAL DEL SITIO - BRINEL BEAUTY STUDIO
//      Maneja la lógica de las animaciones de Reveal al hacer Scroll y Navbar
// ══════════════════════════════════════════════════════════════════════════════

// Esperamos a que el DOM (la estructura de la página) esté completamente cargado.
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. LÓGICA DE REVEAL AL HACER SCROLL ---
    // Esta función activa las animaciones de 'reveal' cuando los elementos son visibles.

    // Seleccionamos todos los elementos que tienen la clase 'reveal'.
    const revealElements = document.querySelectorAll('.reveal');

    /**
     * Función principal que comprueba la visibilidad de los elementos y activa la animación.
     */
    const activeRevealOnScroll = () => {
        // Obtenemos la altura total de la ventana (viewport).
        const windowHeight = window.innerHeight;
        // Definimos un punto de disparo (trigger point), ej: el 85% de la ventana.
        const revealPoint = windowHeight * 0.85;

        // Recorremos cada uno de los elementos con la clase 'reveal'.
        revealElements.forEach(element => {
            // Obtenemos la distancia desde la parte superior de la página hasta el elemento.
            const revealTop = element.getBoundingClientRect().top;

            // Si la parte superior del elemento ha subido por encima del punto de disparo.
            if (revealTop < revealPoint) {
                // Añadimos la clase 'visible' (definida en el CSS) para iniciar la animación.
                element.classList.add('visible');
            } else {
                // Opcional: Si quieres que la animación se repita cada vez que subas y bajes,
                // descomenta la siguiente línea. Si solo quieres que aparezca una vez, déjala así.
                // element.classList.remove('visible');
            }
        });
    };

    // --- 2. LÓGICA DEL NAVBAR AL HACER SCROLL ---
    // Esta función añade una sombra y cambia el fondo del navbar al hacer scroll.

    const navbar = document.querySelector('.navbar');

    /**
     * Función que comprueba el scroll y añade la clase al navbar.
     */
    const handleNavbarScroll = () => {
        // Si el scroll vertical es mayor a 50px.
        if (window.scrollY > 50) {
            // Añadimos la clase 'scrolled' (definida en el CSS).
            navbar.classList.add('scrolled');
        } else {
            // Quitamos la clase 'scrolled' cuando volvemos arriba.
            navbar.classList.remove('scrolled');
        }
    };


    // --- 3. INICIALIZACIÓN Y EVENT LISTENERS ---

    // Ejecutamos las funciones una vez al cargar la página por si hay elementos ya visibles.
    activeRevealOnScroll();
    handleNavbarScroll();

    // Registramos el evento de 'scroll' para que ejecute las funciones cada vez que muevas la rueda.
    window.addEventListener('scroll', activeRevealOnScroll);
    window.addEventListener('scroll', handleNavbarScroll);

});

// --- ENVÍO DE FORMULARIO A WHATSAPP ---
document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'citaForm') {
        e.preventDefault();
        console.log("Formulario detectado correctamente"); // Esto te confirmará que el JS despertó

        if (citaForm) {
            citaForm.addEventListener('submit', function (e) {
                e.preventDefault();

                // 1. Validar campos con Bootstrap
                if (!this.checkValidity()) {
                    e.stopPropagation();
                    this.classList.add('was-validated');
                    return;
                }

                // 2. Efecto de carga en el botón
                const btn = document.getElementById('btnCita');
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Conectando...';

                // 3. Captura de datos
                const nombre = document.getElementById('nombreCliente').value;
                const telefono = document.getElementById('telefonoCliente').value;
                const servicio = document.getElementById('servicioCliente').value;
                const fecha = document.getElementById('fechaCliente').value;
                const mensaje = document.getElementById('mensajeCliente').value || "Sin mensaje adicional";

                // 4. Tu número de WhatsApp
                const miNumero = "50255126664";

                // 5. Construcción del mensaje con formato WhatsApp
                // Usamos \n para saltos de línea y * para negritas
                const textoWA = `*¡Nueva Solicitud de Cita!* ✨\n\n` +
                    `*Cliente:* ${nombre}\n` +
                    `*WhatsApp:* ${telefono}\n` +
                    `*Servicio:* ${servicio}\n` +
                    `*Fecha:* ${fecha}\n` +
                    `*Nota:* ${mensaje}`;

                // 6. Generar URL segura
                const url = `https://wa.me/${miNumero}?text=${encodeURIComponent(textoWA)}`;

                // 7. Retraso de 1 segundo para mostrar el spinner y luego redirigir
                setTimeout(() => {
                    window.open(url, '_blank');

                    // 8. Ocultar formulario y mostrar mensaje de éxito
                    this.style.display = 'none';
                    document.getElementById('mensajeExito').classList.remove('d-none');
                }, 1000);
            });
        }
    }
});