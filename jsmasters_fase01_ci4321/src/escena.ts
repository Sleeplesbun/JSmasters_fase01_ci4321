// src/escena.ts
import { mat4 } from 'gl-matrix';
import { ATTRIB, createFixedFunction, LIGHTING } from './vendor/ff/ff';
import { buildPlane, buildBox, buildSphere } from './geometria';
import { teclado, iniciarControles, sePresiono, finDeCuadro } from './controles';

function createVAO(gl: WebGL2RenderingContext, vertices: Float32Array, indices: Uint16Array) {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTRIB.POSITION);
  gl.vertexAttribPointer(ATTRIB.POSITION, 3, gl.FLOAT, false, 0, 0);

  const iBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return vao;
}

export function iniciarJuego(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('webgl2');
  if (!ctx) throw new Error('WebGL2 no está disponible.');
  const gl: WebGL2RenderingContext = ctx;

  const ff = createFixedFunction(gl, { debug: true });
  ff.disable(LIGHTING);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.92, 1.0); // Azul cielo

  // --- PREPARAR GEOMETRÍA EN LA GPU ---
  const planoGeom = buildPlane(400, 400);
  const vaoSuelo = createVAO(gl, planoGeom.vertices, planoGeom.indices);

  const cajaGeom = buildBox(1, 1, 1);
  const vaoCaja = createVAO(gl, cajaGeom.vertices, cajaGeom.indices);

  const esferaGeom = buildSphere(1, 20, 20); // radio 1: el tamaño real se da con scale
  const vaoEsfera = createVAO(gl, esferaGeom.vertices, esferaGeom.indices);

  // --- SISTEMA DE JERARQUÍAS (MATRIX STACK) ---
  let modelMatrix = mat4.create();
  const matrixStack: mat4[] = [];

  function pushMatrix() {
    matrixStack.push(mat4.clone(modelMatrix));
  }

  function popMatrix() {
    if (matrixStack.length > 0) {
      modelMatrix = matrixStack.pop()!;
    }
  }

  // --- VARIABLES DE ESTADO ---
  let torretaX = 0;
  let canonAngle = 30;
  let nivelFuerza = 1;        // 1, 2 o 3
  let balaDisponible = true;  // true = la bala reposa en la punta del cañón

  const RADIO_BALA = 0.3;
  const RADIO_OBJETIVO = 1.5;

  // Objetivos: cada uno a una profundidad y altura distintas.
  // La torreta está en z = 8; el comentario dice cuánto más adelante está cada uno.
  const objetivos: { pos: [number, number, number]; vivo: boolean }[] = [
    { pos: [-7, 3, -2], vivo: true },  // a 10 de distancia: fuerza 1
    { pos: [6, 5, -12], vivo: true },  // a 20: fuerza 2
    { pos: [0, 7, -24], vivo: true },  // a 32: fuerza 3
  ];

  iniciarControles();

  // --- FUNCIONES DE DIBUJO MODULARES ---

  function dibujarSuelo() {
    pushMatrix();
      ff.setModelMatrix(modelMatrix);
      ff.setColor([0.55, 0.27, 0.07, 1.0]);
      gl.bindVertexArray(vaoSuelo);
      ff.drawElements(gl.TRIANGLES, planoGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();
  }

  function dibujarObjetivos() {
    for (const obj of objetivos) {
      if (!obj.vivo) continue; // un objetivo alcanzado no se dibuja
      pushMatrix();
        mat4.translate(modelMatrix, modelMatrix, obj.pos);
        mat4.scale(modelMatrix, modelMatrix, [RADIO_OBJETIVO, RADIO_OBJETIVO, RADIO_OBJETIVO]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.9, 0.3, 0.1, 1.0]); // anaranjado rojizo
        gl.bindVertexArray(vaoEsfera);
        ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();
    }
  }

  // 1. EL CUERPO: solo se traslada en X
  function dibujarCuerpoTorreta() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [torretaX, 0.25, 8]);

      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [2.5, 0.5, 2.5]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.2, 0.2, 0.2, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // Soportes laterales: fijos al cuerpo, la cabeza gira entre ellos
      for (const lado of [-1, 1]) {
        pushMatrix();
          mat4.translate(modelMatrix, modelMatrix, [lado * 0.7, 0.65, 0]);
          mat4.scale(modelMatrix, modelMatrix, [0.15, 0.8, 0.8]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor([0.25, 0.25, 0.25, 1.0]);
          gl.bindVertexArray(vaoCaja);
          ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

      dibujarCabezaTorreta();
    popMatrix();
  }

  // 2. LA TORRETA (CABEZA): gira junto con el cañón alrededor del pivote
  function dibujarCabezaTorreta() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 0.9, 0]);                // pivote = centro de la cabeza
      mat4.rotateX(modelMatrix, modelMatrix, canonAngle * (Math.PI / 180)); // elevación

      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [1.2, 0.8, 0.9]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.35, 0.35, 0.35, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      dibujarCanon();
    popMatrix();
  }

  // 3. EL CAÑÓN: hijo de la cabeza, hereda su rotación
  function dibujarCanon() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -0.45]); // cara frontal de la cabeza
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5]);  // el tubo nace desde su base

      // Tubo principal del cañón
      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [0.4, 0.4, 3.0]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.15, 0.15, 0.15, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // Bala en reposo: hija del cañón, lo acompaña al moverse y al girar
      if (balaDisponible) {
        pushMatrix();
          mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5 - RADIO_BALA]); // punta del tubo
          mat4.scale(modelMatrix, modelMatrix, [RADIO_BALA, RADIO_BALA, RADIO_BALA]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor([0.0, 0.0, 0.0, 1.0]); // negra
          gl.bindVertexArray(vaoEsfera);
          ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

      // Indicadores de fuerza (3 barras verdes) — PROVISIONAL: se rehacen en la fase 3
      const coloresFuerza: [number, number, number, number][] = [
        [0.0, 0.9, 0.0, 1.0], // Verde brillante
        [0.0, 0.5, 0.0, 1.0], // Verde medio
        [0.0, 0.3, 0.0, 1.0]  // Verde oscuro
      ];

      for (let i = 0; i < 3; i++) {
        pushMatrix();
          mat4.translate(modelMatrix, modelMatrix, [0, 0.25, -0.2 - (i * 0.6)]);
          mat4.scale(modelMatrix, modelMatrix, [0.1, 0.1, 0.4]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor(coloresFuerza[i]);
          gl.bindVertexArray(vaoCaja);
          ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

    popMatrix();
  }

  // --- EL CICLO DE JUEGO ---
  let ultimo = performance.now(); // momento del cuadro anterior

  function loop(ahora: number) {
    // dt = segundos que pasaron desde el cuadro anterior
    const dt = Math.min((ahora - ultimo) / 1000, 0.1);
    ultimo = ahora;

    // Solo cambia el tamaño del canvas si la ventana cambió
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- LÓGICA DE MOVIMIENTO (independiente de los FPS) ---
    const velocidadMovimiento = 18; // unidades por segundo
    const velocidadRotacion = 90;   // grados por segundo

    if (teclado.Izquierda) torretaX -= velocidadMovimiento * dt;
    if (teclado.Derecha) torretaX += velocidadMovimiento * dt;

    // Límites del recorrido horizontal
    torretaX = Math.max(-10, Math.min(10, torretaX));

    if (teclado.Arriba) canonAngle += velocidadRotacion * dt;
    if (teclado.Abajo) canonAngle -= velocidadRotacion * dt;

    // Límite del cañón: entre 5° y 90°, inclusive
    canonAngle = Math.max(5, Math.min(90, canonAngle));

    // --- ACCIONES DE UNA SOLA PULSACIÓN ---
    if (sePresiono('Digit1')) nivelFuerza = 1;
    if (sePresiono('Digit2')) nivelFuerza = 2;
    if (sePresiono('Digit3')) nivelFuerza = 3;
    if (sePresiono('KeyF')) nivelFuerza = (nivelFuerza % 3) + 1; // 1 → 2 → 3 → 1

    if (sePresiono('Space') && balaDisponible) {
      console.log('Disparo con fuerza', nivelFuerza); // TEMPORAL: aquí irá la física (fase 4)
    }

    if (sePresiono('KeyR')) {
      for (const obj of objetivos) obj.vivo = true;
      balaDisponible = true;
      console.log('Reinicio'); // TEMPORAL
    }

    // --- CÁMARA ---
    const aspect = canvas.width / canvas.height;
    const proj = mat4.create();
    // Garantiza al menos 70° horizontales y 45° verticales con cualquier tamaño de ventana
    const fovHorizontal = 70 * (Math.PI / 180);
    const fovVertical = Math.max(Math.PI / 4, 2 * Math.atan(Math.tan(fovHorizontal / 2) / aspect));
    mat4.perspective(proj, fovVertical, aspect, 0.1, 1000.0);
    ff.setProjectionMatrix(proj);

    const view = mat4.create();
    mat4.lookAt(view, [0, 13, 30], [0, 2, -8], [0, 1, 0]);
    ff.setViewMatrix(view);

    // --- DIBUJO ---
    mat4.identity(modelMatrix);
    dibujarSuelo();
    dibujarObjetivos();
    dibujarCuerpoTorreta();

    finDeCuadro(); // descarta las pulsaciones de este cuadro
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}