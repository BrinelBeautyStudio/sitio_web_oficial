/* Guarda en el sistema de órdenes cada solicitud del formulario «Agenda tu cita».
   El formulario sigue abriendo WhatsApp como siempre; esto solo deja una copia
   para que la dueña la vea en la pestaña «Solicitudes». Firebase se carga solo
   al enviar, para no hacer más lenta la página. */
const form = document.getElementById('citaForm');
if (form) {
  form.addEventListener('submit', async () => {
    if (!form.checkValidity()) return;
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
    } catch (e) {
      console.warn('[Brinel] No se pudo guardar la solicitud', e);
    }
  });
}
