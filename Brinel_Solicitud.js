/* Guarda en el sistema de órdenes cada solicitud del formulario «Agenda tu cita».
   El formulario sigue abriendo WhatsApp como siempre; esto solo deja una copia
   para que la dueña la vea en la pestaña «Solicitudes». Firebase se carga solo
   al enviar, para no hacer más lenta la página.

   Protección contra spam (robots y envíos masivos), sin molestar a la clienta:
   1. Campo trampa (honeypot): oculto para las personas; si viene lleno, es un robot.
   2. Tiempo mínimo: un robot envía en menos de 2 segundos de abrir la página.
   3. Límite por aparato: máximo unas pocas solicitudes por hora desde el mismo teléfono.
   Ninguna de estas tres bloquea a una clienta real; solo evitan que llenen la
   pestana de Solicitudes con basura. */
(function () {
  'use strict';
  const form = document.getElementById('citaForm');
  if (!form) return;

  const CARGA = Date.now();                 // momento en que se abrió la página
  const K_ENVIOS = 'brinel-sol-envios';     // marcas de tiempo de envíos recientes
  const MAX_POR_HORA = 4;                   // solicitudes permitidas por aparato en 1 hora
  const HORA = 60 * 60 * 1000;

  const leer = () => { try { return JSON.parse(localStorage.getItem(K_ENVIOS) || '[]'); } catch (e) { return []; } };
  const guardar = (a) => { try { localStorage.setItem(K_ENVIOS, JSON.stringify(a)); } catch (e) { /* sin almacenamiento */ } };

  // Devuelve true si este aparato ya pasó el límite de la última hora.
  function demasiados() {
    const recientes = leer().filter((t) => Date.now() - t < HORA);
    guardar(recientes);
    return recientes.length >= MAX_POR_HORA;
  }

  form.addEventListener('submit', async () => {
    if (!form.checkValidity()) return;

    const hp = document.getElementById('sitioWeb');
    // 1. Trampa llena → robot. 2. Envío demasiado rápido → robot. 3. Límite por aparato.
    if (hp && hp.value.trim() !== '') return;
    if (Date.now() - CARGA < 2000) return;
    if (demasiados()) return;

    const v = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    try {
      const [{ initializeApp }, { getFirestore, collection, addDoc, serverTimestamp }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
      ]);
      const app = initializeApp({
        apiKey: 'AIzaSyApHjbTPq5Kqb53vRQgaEeiai3k2-xUx8E',
        authDomain: 'brinel-beauty.firebaseapp.com',
        projectId: 'brinel-beauty',
        appId: '1:272660556098:web:696778ebc2c785959500db'
      }, 'solicitudes');
      const fecha = v('fechaCliente');
      await addDoc(collection(getFirestore(app), 'solicitudes'), {
        nombre: v('nombreCliente').slice(0, 80),
        telefono: v('telefonoCliente').slice(0, 20),
        servicio: v('servicioCliente').slice(0, 60),
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : '',
        mensaje: v('mensajeCliente').slice(0, 500),
        origen: 'web', estado: 'nueva', notificada: false,
        creada: serverTimestamp()
      });
      // Registrar este envío para el límite por aparato.
      const recientes = leer().filter((t) => Date.now() - t < HORA);
      recientes.push(Date.now());
      guardar(recientes);
    } catch (e) {
      console.warn('[Brinel] No se pudo guardar la solicitud', e);
    }
  });
})();
