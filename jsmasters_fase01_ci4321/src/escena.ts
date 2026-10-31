
import { mat4 } from 'gl-matrix';
import { ATTRIB, createFixedFunction, LIGHTING } from './vendor/ff/ff';
import { buildPlane, buildBox } from './geometria';
import { teclado, iniciarControles } from './controles'; // <-- Importamos los controles

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
  const planoGeom = buildPlane(40, 40);
  const vaoSuelo = createVAO(gl, planoGeom.vertices, planoGeom.indices);

  const cajaGeom = buildBox(1, 1, 1);
  const vaoCaja = createVAO(gl, cajaGeom.vertices, cajaGeom.indices);

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
  let torretaX = 0;    // Ahora es 'let' para poder moverla
  let canonAngle = 30; // Ahora es 'let' para cambiar la inclinación

  // Arrancamos el detector de teclado
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

  // 1. EL CUERPO
  function dibujarCuerpoTorreta() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [torretaX, 0.25, 0]);
      
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

  // 2. LA TORRETA (CABEZA)
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

  // 3. EL CAÑÓN
  function dibujarCanon() {
    pushMatrix();
      // 1. Movemos el pivote a la cara frontal (hacia el fondo del mundo, o sea -Z)
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -0.75]);
      
      // 2. Aplicamos la rotación (positivo hacia arriba)
      mat4.rotateX(modelMatrix, modelMatrix, canonAngle * (Math.PI / 180));
      
      // 3. Movemos el tubo hacia el fondo para que gire desde su base, no desde su centro
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5]); 

      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [0.4, 0.4, 3.0]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.15, 0.15, 0.15, 1.0]); 
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();
    popMatrix();
  }
  // --- EL CICLO DE JUEGO ---
  function loop() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // --- LÓGICA DE MOVIMIENTO (Punto Extra: Movimiento Suave) ---
    const velocidadMovimiento = 0.3; // Qué tan rápido se mueve a los lados
    const velocidadRotacion = 1.5;   // Qué tan rápido sube/baja el cañón

    if (teclado.Izquierda) torretaX -= velocidadMovimiento;
    if (teclado.Derecha) torretaX += velocidadMovimiento;

    // Límite de pantalla para la torreta (Rúbrica: "No debe salirse del área visible")
    torretaX = Math.max(-18, Math.min(18, torretaX)); 

    if (teclado.Arriba) canonAngle += velocidadRotacion;
    if (teclado.Abajo) canonAngle -= velocidadRotacion;

    // Límite del cañón (Rúbrica: "Entre 5 grados y 90 grados")
    canonAngle = Math.max(5, Math.min(90, canonAngle));

    // --- CÁMARA ---
    const aspect = canvas.width / canvas.height;
    const proj = mat4.create();
    mat4.perspective(proj, Math.PI / 4, aspect, 0.1, 1000.0);
    ff.setProjectionMatrix(proj);

    const view = mat4.create();
    mat4.lookAt(view, [0, 4, 22], [0, 6, -10], [0, 1, 0]);
    ff.setViewMatrix(view);

    // --- DIBUJO ---
    mat4.identity(modelMatrix); 
    dibujarSuelo();
    dibujarCuerpoTorreta(); 

    requestAnimationFrame(loop);
  }

  loop();
}