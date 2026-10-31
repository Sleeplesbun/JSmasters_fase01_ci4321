// src/escena.ts
import { mat4 } from 'gl-matrix';
import { ATTRIB, createFixedFunction, LIGHTING } from './vendor/ff/ff';
import { buildPlane, buildBox } from './geometria';

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

  // Geometría en memoria
  const planoGeom = buildPlane(40, 40);
  const vaoSuelo = createVAO(gl, planoGeom.vertices, planoGeom.indices);

  const cajaGeom = buildBox(1, 1, 1);
  const vaoCaja = createVAO(gl, cajaGeom.vertices, cajaGeom.indices);

  // --- NUESTRO SISTEMA DE JERARQUÍAS (MATRIX STACK) ---
  let modelMatrix = mat4.create(); // Matriz actual del mundo
  const matrixStack: mat4[] = [];  // Pila para guardar estados

  function pushMatrix() {
    matrixStack.push(mat4.clone(modelMatrix));
  }

  function popMatrix() {
    if (matrixStack.length > 0) {
      modelMatrix = matrixStack.pop()!;
    }
  }

  // --- EL CICLO DE JUEGO ---
  function loop() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const aspect = canvas.width / canvas.height;

    // 1. Matriz de Proyección (gl-matrix usa radianes, 45° = Math.PI / 4)
    const proj = mat4.create();
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 1000.0);
    ff.setProjectionMatrix(proj); // Se la pasamos al motor del profesor

    // 2. Matriz de Vista (Cámara)
    const view = mat4.create();
    mat4.lookAt(view, [0, 10, 20], [0, 0, 0], [0, 1, 0]);
    ff.setViewMatrix(view); // Se la pasamos al motor del profesor

    // --- DIBUJO DEL MUNDO ---

    // Reiniciamos la matriz modelo al origen (0,0,0) antes de empezar a dibujar
    mat4.identity(modelMatrix); 

    // A) DIBUJAR SUELO
    ff.setModelMatrix(modelMatrix); // Le decimos al motor dónde está el objeto
    ff.setColor([0.55, 0.27, 0.07, 1.0]); 
    gl.bindVertexArray(vaoSuelo);
    ff.drawElements(gl.TRIANGLES, planoGeom.indices.length, gl.UNSIGNED_SHORT, 0);

    // B) DIBUJAR BASE DE LA TORRETA
    pushMatrix();
      // Mover arriba en Y y escalar
      mat4.translate(modelMatrix, modelMatrix, [0, 0.5, 0]);
      mat4.scale(modelMatrix, modelMatrix, [2, 1, 2]);
      
      ff.setModelMatrix(modelMatrix); // Actualizamos la matriz en el motor
      ff.setColor([0.3, 0.3, 0.3, 1.0]);
      
      gl.bindVertexArray(vaoCaja);
      ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();

    requestAnimationFrame(loop);
  }

  loop();
}