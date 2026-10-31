// src/escena.ts
import { mat4 } from 'gl-matrix';
import { ATTRIB, createFixedFunction, LIGHTING } from './vendor/ff/ff';
import { buildPlane, buildBox, buildSphere } from './geometria'; 
import { teclado, iniciarControles } from './controles';

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
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 no está disponible.');

  const ff = createFixedFunction(gl, { debug: true });
  ff.disable(LIGHTING);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.92, 1.0); // Azul cielo

  // --- PREPARAR GEOMETRÍA EN LA GPU ---
  const planoGeom = buildPlane(200, 200); 
  const vaoSuelo = createVAO(gl, planoGeom.vertices, planoGeom.indices);

  const cajaGeom = buildBox(1, 1, 1);
  const vaoCaja = createVAO(gl, cajaGeom.vertices, cajaGeom.indices);

  const esferaGeom = buildSphere(1.5, 20, 20);
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
    const colorObjetivo: [number, number, number, number] = [0.9, 0.3, 0.1, 1.0]; 

    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [-10, 6, 0]);
      ff.setModelMatrix(modelMatrix);
      ff.setColor(colorObjetivo); 
      gl.bindVertexArray(vaoEsfera);
      ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();

    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 12, -15]);
      ff.setModelMatrix(modelMatrix);
      ff.setColor(colorObjetivo);
      gl.bindVertexArray(vaoEsfera);
      ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();

    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [12, 8, 5]);
      ff.setModelMatrix(modelMatrix);
      ff.setColor(colorObjetivo);
      gl.bindVertexArray(vaoEsfera);
      ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();
  }

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

      dibujarCabezaTorreta();
    popMatrix();
  }

  function dibujarCabezaTorreta() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 0.65, 0]);

      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [1.2, 0.8, 1.5]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.35, 0.35, 0.35, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      dibujarCanon();
    popMatrix();
  }

  function dibujarCanon() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -0.75]);
      mat4.rotateX(modelMatrix, modelMatrix, canonAngle * (Math.PI / 180));
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5]);

      // Tubo principal del cañón
      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [0.4, 0.4, 3.0]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.15, 0.15, 0.15, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // Indicadores de fuerza (3 barras verdes)
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
  function loop() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // --- LÓGICA DE MOVIMIENTO ---
    const velocidadMovimiento = 0.3; 
    const velocidadRotacion = 1.5;   

    if (teclado.Izquierda) torretaX -= velocidadMovimiento;
    if (teclado.Derecha) torretaX += velocidadMovimiento;
    
    // Tus límites manuales ajustados
    torretaX = Math.max(-13, Math.min(13, torretaX)); 

    if (teclado.Arriba) canonAngle += velocidadRotacion;
    if (teclado.Abajo) canonAngle -= velocidadRotacion;
    canonAngle = Math.max(5, Math.min(90, canonAngle));

    // --- CÁMARA ---
    const aspect = canvas.width / canvas.height;
    const proj = mat4.create();
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 1000.0);
    ff.setProjectionMatrix(proj);

    const view = mat4.create();
    mat4.lookAt(view, [0, 6, 22], [0, 3, -10], [0, 1, 0]);
    ff.setViewMatrix(view);

    // --- DIBUJO ---
    mat4.identity(modelMatrix); 
    
    dibujarSuelo();
    dibujarObjetivos(); 
    dibujarCuerpoTorreta(); 

    requestAnimationFrame(loop);
  }

  loop();
}