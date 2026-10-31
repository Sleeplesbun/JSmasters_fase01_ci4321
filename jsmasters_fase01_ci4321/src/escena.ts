// src/escena.ts
import { mat4, vec3 } from 'gl-matrix';
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

  // Colores de las barras de fuerza (los usan los dos indicadores)
  const BARRA_APAGADA: [number, number, number, number] = [0.0, 0.3, 0.0, 1.0];   // verde oscuro
  const BARRA_ENCENDIDA: [number, number, number, number] = [0.4, 1.0, 0.4, 1.0]; // verde claro

  // --- FÍSICA DEL PROYECTIL ---
  const GRAVEDAD = 9.8;                 // unidades/s², hacia -Y
  const FUERZAS = [0, 12, 16, 20];      // rapidez inicial por nivel (índice 1, 2, 3)
  const PASO_FISICA = 1 / 120;          // la física avanza en pasos fijos: mismo vuelo a 30 o a 144 FPS
  let acumulador = 0;                   // tiempo real pendiente de simular

  const bala = {
    p0: vec3.create(),  // posición al disparar
    v0: vec3.create(),  // velocidad al disparar
    t: 0,               // segundos de vuelo simulados
    pos: vec3.create(), // posición actual
  };

  // Matriz de mundo de la bala en reposo; se guarda al dibujarla y se usa al disparar
  const matrizBalaReposo = mat4.create();

  // Tiro parabólico: p(t) = p0 + v0·t + ½·g·t², con la gravedad solo en Y
  function posicionBala(t: number, out: vec3) {
    out[0] = bala.p0[0] + bala.v0[0] * t;
    out[1] = bala.p0[1] + bala.v0[1] * t - 0.5 * GRAVEDAD * t * t;
    out[2] = bala.p0[2] + bala.v0[2] * t;
  }

  function disparar() {
    // Posición: la traslación de la matriz de la punta, en coordenadas de mundo
    mat4.getTranslation(bala.p0, matrizBalaReposo);

    // Dirección: el tubo apunta hacia -Z local; en la matriz, el eje Z local es la columna 2
    const direccion = vec3.fromValues(-matrizBalaReposo[8], -matrizBalaReposo[9], -matrizBalaReposo[10]);
    vec3.normalize(direccion, direccion);
    vec3.scale(bala.v0, direccion, FUERZAS[nivelFuerza]);

    bala.t = 0;
    vec3.copy(bala.pos, bala.p0);
    acumulador = 0;
    balaDisponible = false;
  }

  function actualizarBala(dt: number) {
    if (balaDisponible) return;
    acumulador += dt;
    while (acumulador >= PASO_FISICA && !balaDisponible) {
      acumulador -= PASO_FISICA;
      bala.t += PASO_FISICA;
      posicionBala(bala.t, bala.pos);

      // Choque con el suelo (y = 0): la bala vuelve a la punta del cañón
      if (bala.pos[1] - RADIO_BALA <= 0) {
        balaDisponible = true;
      }
      // FASE 5: aquí va el choque con los objetivos
    }
  }

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

  // Bala en vuelo: se dibuja en coordenadas de mundo, ya no es hija del cañón
  function dibujarBalaEnVuelo() {
    if (balaDisponible) return;
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, bala.pos);
      mat4.scale(modelMatrix, modelMatrix, [RADIO_BALA, RADIO_BALA, RADIO_BALA]);
      ff.setModelMatrix(modelMatrix);
      ff.setColor([0.0, 0.0, 0.0, 1.0]);
      gl.bindVertexArray(vaoEsfera);
      ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();
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

      dibujarIndicadorFuerza();
      dibujarCabezaTorreta();
    popMatrix();
  }

  // INDICADOR DE FUERZA: 3 barras apiladas en la parte trasera del cuerpo, mirando a la cámara
  function dibujarIndicadorFuerza() {
    const ANCHO = 0.4, ALTO = 0.12, FONDO = 0.05, SEPARACION = 0.08;

    for (let i = 0; i < 3; i++) {
      // i = 0 es la barra de abajo: siempre encendida porque nivelFuerza >= 1
      const encendida = i < nivelFuerza;
      const y = 0.25 + ALTO / 2 + i * (ALTO + SEPARACION); // 0.25 = cara de arriba del cuerpo
      pushMatrix();
        // Esquina trasera derecha del cuerpo: fuera de los soportes (x = ±0.775), así la cabeza no la tapa
        mat4.translate(modelMatrix, modelMatrix, [0.95, y, 1.2]);
        mat4.scale(modelMatrix, modelMatrix, [ANCHO, ALTO, FONDO]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor(encendida ? BARRA_ENCENDIDA : BARRA_APAGADA);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();
    }
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

      // Indicador decorativo sobre el tubo: repite el nivel de fuerza y gira con el cañón.
      // El indicador oficial del enunciado es el del cuerpo (dibujarIndicadorFuerza).
      for (let i = 0; i < 3; i++) {
        const encendida = i < nivelFuerza;
        pushMatrix();
          // i = 0 queda más cerca de la base del tubo; i = 2, más cerca de la punta
          mat4.translate(modelMatrix, modelMatrix, [0, 0.25, 0.6 - i * 0.6]);
          mat4.scale(modelMatrix, modelMatrix, [0.1, 0.1, 0.4]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor(encendida ? BARRA_ENCENDIDA : BARRA_APAGADA);
          gl.bindVertexArray(vaoCaja);
          ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

      // Bala en reposo: hija del cañón, lo acompaña al moverse y al girar
      if (balaDisponible) {
        pushMatrix();
          mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5 - RADIO_BALA]); // punta del tubo
          mat4.copy(matrizBalaReposo, modelMatrix); // se guarda para saber desde dónde disparar
          mat4.scale(modelMatrix, modelMatrix, [RADIO_BALA, RADIO_BALA, RADIO_BALA]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor([0.0, 0.0, 0.0, 1.0]); // negra
          gl.bindVertexArray(vaoEsfera);
          ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
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

    if (sePresiono('Space') && balaDisponible) disparar();

    if (sePresiono('KeyR')) {
      for (const obj of objetivos) obj.vivo = true;
      balaDisponible = true;
      acumulador = 0;
    }

    actualizarBala(dt);

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
    dibujarBalaEnVuelo();
    dibujarCuerpoTorreta();

    finDeCuadro(); // descarta las pulsaciones de este cuadro
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}