// src/escena.ts
// Lógica y dibujo del juego "Apuntar al objetivo".
// Contiene: la preparación de WebGL2 y de las figuras, el estado del juego,
// la física del proyectil, las colisiones, el dibujo de cada objeto
// (usando una jerarquía de transformaciones) y el ciclo principal que se repite en cada cuadro.

import { mat4, vec3 } from 'gl-matrix';
import { ATTRIB, createFixedFunction, LIGHTING } from './vendor/ff/ff';
import { buildPlane, buildBox, buildSphere } from './geometria';
import { teclado, iniciarControles, sePresiono, finDeCuadro } from './controles';

/**
 * Sube una figura a la GPU y la deja lista para dibujarse.
 *
 * Entrada: gl (el contexto de WebGL2), vertices (posiciones x, y, z) e indices (triángulos).
 * Salida:  un VAO (Vertex Array Object): un objeto que recuerda dónde están los datos
 *          de la figura y cómo leerlos.
 * Qué hace: crea un buffer con los vértices y otro con los índices, y guarda esa
 *           configuración en el VAO. Después, para dibujar la figura basta con activar su VAO.
 */
function createVAO(gl: WebGL2RenderingContext, vertices: Float32Array, indices: Uint16Array) {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // Buffer de vértices: cada vértice son 3 números (x, y, z) de tipo float
  const vBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTRIB.POSITION);
  gl.vertexAttribPointer(ATTRIB.POSITION, 3, gl.FLOAT, false, 0, 0);

  // Buffer de índices: qué vértices forman cada triángulo
  const iBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // Se desactiva el VAO para que ninguna configuración posterior lo modifique por accidente
  gl.bindVertexArray(null);
  return vao;
}

/**
 * Punto de entrada del juego. Se llama una vez desde main.ts.
 *
 * Entrada: canvas, el lienzo HTML donde se dibuja la escena.
 * Salida:  ninguna (el juego queda corriendo en un ciclo continuo).
 * Qué hace: prepara WebGL2 y las figuras, define el estado del juego y las funciones
 *           de física y dibujo, y arranca el ciclo principal.
 */
export function iniciarJuego(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('webgl2');
  if (!ctx) throw new Error('WebGL2 no está disponible.');
  // Se guarda en una constante con tipo explícito para que TypeScript sepa,
  // dentro de todas las funciones internas, que gl nunca es null
  const gl: WebGL2RenderingContext = ctx;

  // FixedFunction: la librería del curso que se encarga de los shaders
  const ff = createFixedFunction(gl, { debug: true });
  ff.disable(LIGHTING);
  gl.enable(gl.DEPTH_TEST);              // los objetos cercanos tapan a los lejanos
  gl.clearColor(0.53, 0.81, 0.92, 1.0); // color de fondo: azul cielo

  // ─── Figuras en la GPU ──────────────────────────────────────────────
  // Solo existen tres figuras. Todos los objetos del juego son una de ellas
  // con una posición, un tamaño y un color distintos.
  const planoGeom = buildPlane(400, 400);
  const vaoSuelo = createVAO(gl, planoGeom.vertices, planoGeom.indices);

  const cajaGeom = buildBox(1, 1, 1);
  const vaoCaja = createVAO(gl, cajaGeom.vertices, cajaGeom.indices);

  const esferaGeom = buildSphere(1, 20, 20); // radio 1: el tamaño real se da al dibujar, con scale
  const vaoEsfera = createVAO(gl, esferaGeom.vertices, esferaGeom.indices);

  // ─── Jerarquía de transformaciones (pila de matrices) ───────────────
  // modelMatrix es la transformación actual. Antes de transformar una pieza se guarda
  // una copia (pushMatrix) y al terminar se recupera (popMatrix). Así cada pieza hija
  // hereda las transformaciones de su padre sin afectar a las piezas hermanas.
  let modelMatrix = mat4.create();
  const matrixStack: mat4[] = [];

  /**
   * Guarda una copia de la transformación actual en la pila.
   * Entrada: ninguna. Salida: ninguna.
   */
  function pushMatrix() {
    matrixStack.push(mat4.clone(modelMatrix));
  }

  /**
   * Recupera la última transformación guardada con pushMatrix.
   * Entrada: ninguna. Salida: ninguna.
   */
  function popMatrix() {
    if (matrixStack.length > 0) {
      modelMatrix = matrixStack.pop()!;
    }
  }

  // ─── Estado del juego ───────────────────────────────────────────────
  let torretaX = 0;           // posición horizontal de la torreta
  let canonAngle = 30;        // elevación del cañón, en grados
  let nivelFuerza = 1;        // nivel de fuerza elegido: 1, 2 o 3
  let balaDisponible = true;  // true: la bala reposa en la punta del cañón y se puede disparar
  let reloj = 0;              // segundos de juego transcurridos; se usa para animaciones (temblor, parpadeo)

  // ─── Sobrecarga del cañón ───────────────────────────────────────────
  // Un toque corto de F cambia el nivel de fuerza. Si F se mantiene, el cañón se
  // sobrecarga y tiembla cada vez más. Es un efecto visual: no cambia la fuerza del disparo.
  const UMBRAL_SOBRECARGA = 0.35;  // segundos: si F se mantiene más que esto, ya no es un toque
  const SOBRECARGA_MAXIMA = 1.5;   // segundos adicionales hasta que el temblor llega a su máximo
  let tiempoF = 0;                 // tiempo que lleva F presionada
  let fPresionadaAntes = false;    // estado de F en el cuadro anterior; sirve para detectar cuándo se suelta

  /**
   * Calcula qué tan sobrecargado está el cañón.
   *
   * Entrada: ninguna (usa tiempoF).
   * Salida:  un número entre 0 (sin sobrecarga) y 1 (sobrecarga máxima).
   * Qué hace: empieza a contar cuando F supera el umbral y crece de forma lineal
   *           hasta llegar a 1. Math.max y Math.min lo mantienen dentro de ese rango.
   */
  function intensidadSobrecarga(): number {
    const s = (tiempoF - UMBRAL_SOBRECARGA) / SOBRECARGA_MAXIMA;
    return Math.max(0, Math.min(1, s));
  }

  const RADIO_BALA = 0.3;
  const RADIO_OBJETIVO = 1.5;

  // Colores de las barras de fuerza, en formato RGBA (rojo, verde, azul, opacidad) de 0 a 1.
  // Los comparten el indicador del cuerpo y el del cañón.
  const BARRA_APAGADA: [number, number, number, number] = [0.0, 0.3, 0.0, 1.0];   // verde oscuro
  const BARRA_ENCENDIDA: [number, number, number, number] = [0.4, 1.0, 0.4, 1.0]; // verde claro
  const BARRA_ALERTA: [number, number, number, number] = [1.0, 0.2, 0.1, 1.0];    // rojo de sobrecarga

  // ─── Objetivos ──────────────────────────────────────────────────────
  // Cada objetivo está a una profundidad y una altura distintas (la torreta está en z = 8).
  // Ángulos de tiro bajo con los que se acierta cada uno, calculados con la misma física
  // del juego (también hay una ventana de tiro alto, de unos 5°, entre los 70° y los 85°):
  //   cercano: nivel 1 (8°-29°), nivel 2 (5°-25°), nivel 3 (5°-23°)
  //   medio:   nivel 2 (22°-34°), nivel 3 (16°-26°)
  //   lejano:  nivel 3 (28°-36°)
  // Así cada nivel de fuerza permite acertar al menos uno, y el lejano exige la fuerza máxima.
  const objetivos: { pos: [number, number, number]; vivo: boolean }[] = [
    { pos: [-7, 3, -2], vivo: true },  // cercano: a 10 unidades de la torreta
    { pos: [6, 5, -12], vivo: true },  // medio: a 20
    { pos: [0, 7, -24], vivo: true },  // lejano: a 32
  ];

  // ─── Explosiones ────────────────────────────────────────────────────
  // Al recibir el impacto, el objetivo desaparece de inmediato y en su lugar se reproduce
  // una animación corta. La explosión es solo visual: no se puede golpear.
  // Cada explosión guarda su posición y cuánto tiempo lleva (t).
  const DURACION_EXPLOSION = 0.45; // segundos
  const explosiones: { pos: vec3; t: number }[] = [];

  // ─── Física del proyectil ───────────────────────────────────────────
  const GRAVEDAD = 9.8;                 // aceleración hacia abajo, en unidades/s²
  const FUERZAS = [0, 12, 16, 20];      // rapidez inicial según el nivel (se usan los índices 1, 2 y 3)
  const PASO_FISICA = 1 / 120;          // la física avanza siempre en pasos de 1/120 s, sin importar los FPS
  let acumulador = 0;                   // tiempo real que todavía falta simular

  // Datos del disparo en curso
  const bala = {
    p0: vec3.create(),  // posición en el momento del disparo
    v0: vec3.create(),  // velocidad en el momento del disparo
    t: 0,               // segundos de vuelo simulados
    pos: vec3.create(), // posición actual
  };

  // Transformación de la bala mientras reposa en la punta del cañón, en coordenadas del mundo.
  // Se guarda cada vez que se dibuja y se usa al disparar.
  const matrizBalaReposo = mat4.create();

  /**
   * Calcula la posición de la bala en un instante del vuelo (tiro parabólico).
   *
   * Entrada: t (segundos desde el disparo) y out (vector donde se escribe el resultado).
   * Salida:  ninguna (el resultado queda en out).
   * Qué hace: aplica p(t) = p0 + v0·t + ½·g·t². En X y Z la bala avanza a velocidad
   *           constante; en Y la gravedad la frena al subir y la acelera al caer.
   */
  function posicionBala(t: number, out: vec3) {
    out[0] = bala.p0[0] + bala.v0[0] * t;
    out[1] = bala.p0[1] + bala.v0[1] * t - 0.5 * GRAVEDAD * t * t;
    out[2] = bala.p0[2] + bala.v0[2] * t;
  }

  /**
   * Dispara la bala desde la punta del cañón.
   *
   * Entrada: ninguna (usa matrizBalaReposo y nivelFuerza).
   * Salida:  ninguna (prepara los datos de la bala y la marca como en vuelo).
   * Qué hace: toma la posición y la dirección del cañón en ese instante y les
   *           asigna la rapidez del nivel de fuerza elegido.
   */
  function disparar() {
    // Posición inicial: la parte de traslación de la matriz de la punta
    mat4.getTranslation(bala.p0, matrizBalaReposo);

    // Dirección: el cañón apunta hacia su -Z local. En una matriz 4×4 de gl-matrix,
    // los elementos 8, 9 y 10 son el eje Z local expresado en el mundo; se invierte el signo
    // para obtener hacia dónde apunta el tubo
    const direccion = vec3.fromValues(-matrizBalaReposo[8], -matrizBalaReposo[9], -matrizBalaReposo[10]);
    vec3.normalize(direccion, direccion); // longitud 1: solo interesa la dirección
    vec3.scale(bala.v0, direccion, FUERZAS[nivelFuerza]);

    bala.t = 0;
    vec3.copy(bala.pos, bala.p0);
    acumulador = 0;
    balaDisponible = false;
  }

  /**
   * Avanza el vuelo de la bala y revisa los choques.
   *
   * Entrada: dt, los segundos reales que pasaron desde el cuadro anterior.
   * Salida:  ninguna (actualiza la bala, los objetivos y las explosiones).
   * Qué hace: suma dt al acumulador y simula tantos pasos fijos como quepan en él.
   *           En cada paso calcula la nueva posición y revisa si la bala tocó un
   *           objetivo o el suelo. Como los pasos son siempre iguales, el disparo dura
   *           lo mismo y cae en el mismo lugar a 30 o a 144 FPS.
   */
  function actualizarBala(dt: number) {
    if (balaDisponible) return;
    acumulador += dt;
    while (acumulador >= PASO_FISICA && !balaDisponible) {
      acumulador -= PASO_FISICA;
      bala.t += PASO_FISICA;
      posicionBala(bala.t, bala.pos);

      // Choque con un objetivo (esfera contra esfera): hay choque si la distancia entre
      // los centros es menor o igual que la suma de los radios. Se comparan los valores
      // al cuadrado para evitar calcular una raíz cuadrada en cada paso.
      for (const obj of objetivos) {
        if (!obj.vivo) continue;
        const distancia2 = vec3.squaredDistance(bala.pos, obj.pos);
        const sumaRadios = RADIO_BALA + RADIO_OBJETIVO;
        if (distancia2 <= sumaRadios * sumaRadios) {
          obj.vivo = false;                                     // el objetivo desaparece
          explosiones.push({ pos: vec3.clone(obj.pos), t: 0 }); // y explota donde estaba
          balaDisponible = true;                                // la bala vuelve a la punta
          break;
        }
      }

      // Choque con el suelo (y = 0): la parte baja de la bala es su centro menos el radio
      if (!balaDisponible && bala.pos[1] - RADIO_BALA <= 0) {
        balaDisponible = true;
      }
    }
  }

  iniciarControles();

  // ─── Funciones de dibujo ────────────────────────────────────────────
  // Todas siguen el mismo patrón: guardar la transformación (pushMatrix), aplicar
  // traslación, rotación o escala, indicar color y figura, dibujar, y recuperar (popMatrix).

  /**
   * Dibuja el suelo marrón.
   * Entrada: ninguna. Salida: ninguna.
   */
  function dibujarSuelo() {
    pushMatrix();
      ff.setModelMatrix(modelMatrix);
      ff.setColor([0.55, 0.27, 0.07, 1.0]); // marrón
      gl.bindVertexArray(vaoSuelo);
      ff.drawElements(gl.TRIANGLES, planoGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();
  }

  /**
   * Dibuja los objetivos que siguen en pie.
   *
   * Entrada: ninguna (usa la lista de objetivos).
   * Salida:  ninguna.
   * Qué hace: para cada objetivo vivo, mueve la esfera de radio 1 a su posición
   *           y la agranda hasta RADIO_OBJETIVO.
   */
  function dibujarObjetivos() {
    for (const obj of objetivos) {
      if (!obj.vivo) continue; // un objetivo alcanzado ya no se dibuja
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

  /**
   * Dibuja las explosiones en curso, al estilo de las caricaturas.
   *
   * Entrada: ninguna (usa la lista de explosiones).
   * Salida:  ninguna.
   * Qué hace: cada explosión tiene tres partes: un destello que crece de golpe y se
   *           encoge, rayos en forma de estrella que salen hacia afuera y nubes de humo
   *           al final. Todo se calcula a partir de k = t / duración, que va de 0 a 1;
   *           por eso la animación dura lo mismo a cualquier FPS.
   */
  function dibujarExplosiones() {
    const BLANCO: [number, number, number, number] = [1.0, 1.0, 0.9, 1.0];
    const AMARILLO: [number, number, number, number] = [1.0, 0.85, 0.1, 1.0];
    const NARANJA: [number, number, number, number] = [1.0, 0.45, 0.0, 1.0];
    const HUMO: [number, number, number, number] = [0.55, 0.55, 0.55, 1.0];

    for (const e of explosiones) {
      const k = e.t / DURACION_EXPLOSION; // avance de la animación: 0 al inicio, 1 al final
      // Curva de salida rápida ("ease-out"): sube muy rápido al principio y se frena al final,
      // lo que da la sensación de algo que revienta
      const salida = 1 - Math.pow(1 - k, 3);

      // 1) Destello: crece hasta su tamaño máximo en el primer 12% de la animación
      //    y luego se encoge hasta desaparecer. Cambia de blanco a amarillo y a naranja.
      const tamano = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      const radioFuego = RADIO_OBJETIVO * 1.3 * tamano;
      pushMatrix();
        mat4.translate(modelMatrix, modelMatrix, e.pos);
        mat4.scale(modelMatrix, modelMatrix, [radioFuego, radioFuego, radioFuego]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor(k < 0.12 ? BLANCO : k < 0.4 ? AMARILLO : NARANJA);
        gl.bindVertexArray(vaoEsfera);
        ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // 2) Rayos: 12 cajas alargadas repartidas en círculo (cada 30°) en el plano XY,
      //    de frente a la cámara. Se alejan del centro y se adelgazan a medida que avanza k.
      //    Se alternan rayos largos y cortos para que la estrella se vea irregular.
      for (let j = 0; j < 12; j++) {
        const esLargo = j % 2 === 0;
        const distancia = RADIO_OBJETIVO * (0.6 + (esLargo ? 1.8 : 1.2) * salida);
        const largo = (esLargo ? 1.1 : 0.7) * (1 - k);
        const grosor = 0.22 * (1 - k);
        pushMatrix();
          mat4.translate(modelMatrix, modelMatrix, e.pos);           // al centro de la explosión
          mat4.rotateZ(modelMatrix, modelMatrix, j * (Math.PI / 6)); // orienta el rayo j
          mat4.translate(modelMatrix, modelMatrix, [distancia, 0, 0]); // lo aleja del centro en esa dirección
          mat4.scale(modelMatrix, modelMatrix, [largo, grosor, grosor]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor(esLargo ? AMARILLO : NARANJA);
          gl.bindVertexArray(vaoCaja);
          ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

      // 3) Humo: aparece en la segunda mitad. Son 5 esferas grises repartidas en círculo
      //    alrededor de la explosión, que crecen, suben un poco y vuelven a encogerse.
      if (k > 0.45) {
        const kh = (k - 0.45) / 0.55;                   // avance dentro de la fase de humo (0 a 1)
        const radioHumo = 0.45 * Math.sin(kh * Math.PI); // el seno entre 0 y π sube de 0 a 1 y vuelve a 0
        for (let j = 0; j < 5; j++) {
          const ang = j * (2 * Math.PI / 5);            // una nube cada 72°
          pushMatrix();
            mat4.translate(modelMatrix, modelMatrix, [
              e.pos[0] + Math.cos(ang) * RADIO_OBJETIVO,
              e.pos[1] + Math.sin(ang) * RADIO_OBJETIVO + kh * 0.6, // el humo sube con el tiempo
              e.pos[2],
            ]);
            mat4.scale(modelMatrix, modelMatrix, [radioHumo, radioHumo, radioHumo]);
            ff.setModelMatrix(modelMatrix);
            ff.setColor(HUMO);
            gl.bindVertexArray(vaoEsfera);
            ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
          popMatrix();
        }
      }
    }
  }

  /**
   * Dibuja la bala mientras está en el aire.
   *
   * Entrada: ninguna (usa bala.pos).
   * Salida:  ninguna.
   * Qué hace: en vuelo, la bala ya no depende del cañón: se dibuja directamente
   *           en su posición del mundo.
   */
  function dibujarBalaEnVuelo() {
    if (balaDisponible) return;
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, bala.pos);
      mat4.scale(modelMatrix, modelMatrix, [RADIO_BALA, RADIO_BALA, RADIO_BALA]);
      ff.setModelMatrix(modelMatrix);
      ff.setColor([0.0, 0.0, 0.0, 1.0]); // negra
      gl.bindVertexArray(vaoEsfera);
      ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
    popMatrix();
  }

  /**
   * Dibuja la torreta completa, empezando por el cuerpo (raíz de la jerarquía).
   *
   * Entrada: ninguna (usa torretaX).
   * Salida:  ninguna.
   * Qué hace: traslada todo a la posición de la torreta y dibuja el cuerpo y los soportes.
   *           Luego llama a las piezas hijas (indicador de fuerza y cabeza), que heredan
   *           esa traslación y por eso se mueven junto con el cuerpo.
   *
   * Jerarquía: cuerpo → soportes, indicador de fuerza, cabeza → cañón → bala en reposo
   */
  function dibujarCuerpoTorreta() {
    pushMatrix();
      // El cuerpo solo se desplaza en X; y = 0.25 lo apoya sobre el suelo (mide 0.5 de alto)
      mat4.translate(modelMatrix, modelMatrix, [torretaX, 0.25, 8]);

      // Base: el scale va en su propio push/pop para que no afecte a las piezas hijas
      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [2.5, 0.5, 2.5]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.2, 0.2, 0.2, 1.0]); // gris oscuro
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // Soportes laterales: fijos al cuerpo; la cabeza gira entre ellos.
      // lado vale -1 (izquierdo) y 1 (derecho), así un solo bloque dibuja los dos.
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

  /**
   * Dibuja el indicador de fuerza del cuerpo (el que pide el enunciado).
   *
   * Entrada: ninguna (usa nivelFuerza).
   * Salida:  ninguna.
   * Qué hace: dibuja 3 barras apiladas en la parte trasera del cuerpo, de cara a la cámara.
   *           El nivel n enciende las n barras de abajo; las demás quedan apagadas.
   */
  function dibujarIndicadorFuerza() {
    const ANCHO = 0.4, ALTO = 0.12, FONDO = 0.05, SEPARACION = 0.08;

    for (let i = 0; i < 3; i++) {
      // i = 0 es la barra de abajo; como el nivel mínimo es 1, siempre está encendida
      const encendida = i < nivelFuerza;
      // Altura de cada barra: arranca sobre la cara superior del cuerpo (y = 0.25)
      // y sube una barra más una separación por cada nivel
      const y = 0.25 + ALTO / 2 + i * (ALTO + SEPARACION);
      pushMatrix();
        // Esquina trasera derecha: fuera de los soportes (que llegan a x = ±0.775),
        // así la cabeza no tapa el indicador desde la cámara
        mat4.translate(modelMatrix, modelMatrix, [0.95, y, 1.2]);
        mat4.scale(modelMatrix, modelMatrix, [ANCHO, ALTO, FONDO]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor(encendida ? BARRA_ENCENDIDA : BARRA_APAGADA);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();
    }
  }

  /**
   * Dibuja la cabeza de la torreta, que sube y baja junto con el cañón.
   *
   * Entrada: ninguna (usa canonAngle y la sobrecarga).
   * Salida:  ninguna.
   * Qué hace: se ubica en el pivote (el centro de la cabeza), aplica el temblor si hay
   *           sobrecarga y luego la rotación de elevación. El cañón se dibuja después,
   *           como hijo, así que hereda la misma rotación y ambos se mueven como una sola pieza.
   */
  function dibujarCabezaTorreta() {
    pushMatrix();
      // Pivote de la elevación: el centro de la cabeza, entre los dos soportes
      mat4.translate(modelMatrix, modelMatrix, [0, 0.9, 0]);

      // Temblor por sobrecarga: un desplazamiento pequeño en los 3 ejes. Cada eje usa un seno
      // con una frecuencia distinta (53, 61 y 47), y como no coinciden, la vibración se ve
      // irregular sin usar números aleatorios. Es solo traslación: no cambia el ángulo
      // (sigue entre 5° y 90°) ni la dirección del disparo.
      const sobrecarga = intensidadSobrecarga();
      if (sobrecarga > 0) {
        const amplitud = 0.07 * sobrecarga;
        mat4.translate(modelMatrix, modelMatrix, [
          Math.sin(reloj * 53) * amplitud,
          Math.sin(reloj * 61 + 1) * amplitud,
          Math.sin(reloj * 47 + 2) * amplitud,
        ]);
      }
      // Elevación: rotación alrededor del eje X. gl-matrix trabaja en radianes (grados × π / 180)
      mat4.rotateX(modelMatrix, modelMatrix, canonAngle * (Math.PI / 180));

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

  /**
   * Dibuja el cañón, su indicador decorativo y la bala en reposo.
   *
   * Entrada: ninguna (usa nivelFuerza, balaDisponible y la sobrecarga).
   * Salida:  ninguna (además guarda matrizBalaReposo, que se usa al disparar).
   * Qué hace: como es hijo de la cabeza, ya viene con la rotación de elevación aplicada.
   *           Dibuja el tubo, las barras decorativas sobre él y, si la bala está disponible,
   *           la bala en la punta.
   */
  function dibujarCanon() {
    pushMatrix();
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -0.45]); // hasta la cara frontal de la cabeza
      mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5]);  // media longitud del tubo: así el tubo empieza en la cabeza

      // Tubo: una caja alargada de 3 unidades en Z
      pushMatrix();
        mat4.scale(modelMatrix, modelMatrix, [0.4, 0.4, 3.0]);
        ff.setModelMatrix(modelMatrix);
        ff.setColor([0.15, 0.15, 0.15, 1.0]);
        gl.bindVertexArray(vaoCaja);
        ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
      popMatrix();

      // Indicador decorativo sobre el tubo: repite el nivel de fuerza y gira con el cañón.
      // El indicador oficial que pide el enunciado es el del cuerpo (dibujarIndicadorFuerza).
      // Con sobrecarga, las barras encendidas parpadean en rojo, más rápido cuanto mayor es:
      // el seno alterna entre positivo y negativo, y eso decide si toca rojo o verde.
      const parpadeoRojo = intensidadSobrecarga() > 0 && Math.sin(reloj * (15 + 25 * intensidadSobrecarga())) > 0;
      for (let i = 0; i < 3; i++) {
        const encendida = i < nivelFuerza;
        const colorEncendida = parpadeoRojo ? BARRA_ALERTA : BARRA_ENCENDIDA;
        pushMatrix();
          // Sobre la cara de arriba del tubo; i = 0 queda más cerca de la base, i = 2 más cerca de la punta
          mat4.translate(modelMatrix, modelMatrix, [0, 0.25, 0.6 - i * 0.6]);
          mat4.scale(modelMatrix, modelMatrix, [0.1, 0.1, 0.4]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor(encendida ? colorEncendida : BARRA_APAGADA);
          gl.bindVertexArray(vaoCaja);
          ff.drawElements(gl.TRIANGLES, cajaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

      // Bala en reposo: como es hija del cañón, lo acompaña al moverse y al girar
      if (balaDisponible) {
        pushMatrix();
          // Hasta la punta del tubo (media longitud) más el radio, para que la bala quede apoyada afuera
          mat4.translate(modelMatrix, modelMatrix, [0, 0, -1.5 - RADIO_BALA]);
          // Se guarda la transformación antes de escalar: en este punto contiene la posición
          // y la orientación de la punta en el mundo, que es lo que necesita disparar()
          mat4.copy(matrizBalaReposo, modelMatrix);
          mat4.scale(modelMatrix, modelMatrix, [RADIO_BALA, RADIO_BALA, RADIO_BALA]);
          ff.setModelMatrix(modelMatrix);
          ff.setColor([0.0, 0.0, 0.0, 1.0]); // negra
          gl.bindVertexArray(vaoEsfera);
          ff.drawElements(gl.TRIANGLES, esferaGeom.indices.length, gl.UNSIGNED_SHORT, 0);
        popMatrix();
      }

    popMatrix();
  }

  // ─── Ciclo principal ────────────────────────────────────────────────
  let ultimo = performance.now(); // momento del cuadro anterior, en milisegundos

  /**
   * Un cuadro del juego. El navegador la llama de nuevo antes de cada actualización
   * de pantalla (normalmente 60 veces por segundo o más).
   *
   * Entrada: ahora, el momento actual en milisegundos (lo entrega requestAnimationFrame).
   * Salida:  ninguna.
   * Qué hace: en orden, calcula el tiempo transcurrido, ajusta el lienzo, procesa las
   *           teclas, actualiza la física y las explosiones, configura la cámara
   *           y dibuja toda la escena.
   */
  function loop(ahora: number) {
    // dt: segundos desde el cuadro anterior. Se limita a 0.1 s para que, si la pestaña
    // estuvo en segundo plano, el juego no dé un salto enorme al volver
    const dt = Math.min((ahora - ultimo) / 1000, 0.1);
    ultimo = ahora;
    reloj += dt;

    // La resolución del lienzo solo se cambia si cambió el tamaño de la ventana,
    // porque cambiarla en cada cuadro obliga a recrear su memoria
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // borra el cuadro anterior

    // ─── Movimiento de la torreta y del cañón ───
    // Las velocidades se expresan por segundo y se multiplican por dt,
    // así el movimiento es igual en cualquier monitor
    const velocidadMovimiento = 18; // unidades por segundo
    const velocidadRotacion = 90;   // grados por segundo

    if (teclado.Izquierda) torretaX -= velocidadMovimiento * dt;
    if (teclado.Derecha) torretaX += velocidadMovimiento * dt;

    // Límites del recorrido horizontal
    torretaX = Math.max(-10, Math.min(10, torretaX));

    if (teclado.Arriba) canonAngle += velocidadRotacion * dt;
    if (teclado.Abajo) canonAngle -= velocidadRotacion * dt;

    // Límites de la elevación: entre 5° y 90°, ambos incluidos
    canonAngle = Math.max(5, Math.min(90, canonAngle));

    // ─── Acciones de una sola pulsación ───
    if (sePresiono('Digit1')) nivelFuerza = 1;
    if (sePresiono('Digit2')) nivelFuerza = 2;
    if (sePresiono('Digit3')) nivelFuerza = 3;

    // Tecla F: la acción se decide al soltarla, porque hasta ese momento no se sabe si fue
    // un toque o una pulsación larga. Toque corto: siguiente nivel (1 → 2 → 3 → 1;
    // el % 3 hace que después del 3 vuelva al 1). Pulsación larga: fue una sobrecarga
    // y el nivel no cambia.
    if (teclado.F) {
      tiempoF += dt;
    } else if (fPresionadaAntes) {
      if (tiempoF < UMBRAL_SOBRECARGA) nivelFuerza = (nivelFuerza % 3) + 1;
      tiempoF = 0;
    }
    fPresionadaAntes = teclado.F;

    // Solo se puede disparar si la bala está en el cañón (una bala en el aire a la vez)
    if (sePresiono('Space') && balaDisponible) disparar();

    // Reinicio: los objetivos reaparecen y la bala vuelve a la punta del cañón
    if (sePresiono('KeyR')) {
      for (const obj of objetivos) obj.vivo = true;
      balaDisponible = true;
      acumulador = 0;
      explosiones.length = 0; // borra las explosiones que estuvieran en curso
    }

    actualizarBala(dt);

    // Avanza las explosiones y elimina las que ya terminaron. Se recorre la lista
    // de atrás hacia adelante porque splice corre los elementos siguientes;
    // de adelante hacia atrás se saltaría el elemento que queda en la posición borrada.
    for (let i = explosiones.length - 1; i >= 0; i--) {
      explosiones[i].t += dt;
      if (explosiones[i].t >= DURACION_EXPLOSION) explosiones.splice(i, 1);
    }

    // ─── Cámara ───
    // Proyección en perspectiva. Normalmente se fija el ángulo de visión vertical,
    // y el horizontal depende de qué tan ancha es la ventana. Aquí se asegura un mínimo
    // de 70° horizontales: si la ventana es angosta, se abre el ángulo vertical lo necesario.
    // Así la torreta se ve completa en todo su recorrido con cualquier tamaño de ventana.
    const aspect = canvas.width / canvas.height;
    const proj = mat4.create();
    const fovHorizontal = 70 * (Math.PI / 180);
    const fovVertical = Math.max(Math.PI / 4, 2 * Math.atan(Math.tan(fovHorizontal / 2) / aspect));
    mat4.perspective(proj, fovVertical, aspect, 0.1, 1000.0); // 0.1 y 1000: distancias mínima y máxima visibles
    ff.setProjectionMatrix(proj);

    // Cámara fija, detrás y por encima de la torreta:
    // lookAt(posición de la cámara, punto al que mira, dirección "arriba")
    const view = mat4.create();
    mat4.lookAt(view, [0, 13, 30], [0, 2, -8], [0, 1, 0]);
    ff.setViewMatrix(view);

    // ─── Dibujo de la escena ───
    mat4.identity(modelMatrix); // se parte de una transformación vacía en cada cuadro
    dibujarSuelo();
    dibujarObjetivos();
    dibujarExplosiones();
    dibujarBalaEnVuelo();
    dibujarCuerpoTorreta();

    finDeCuadro(); // descarta las pulsaciones de este cuadro
    requestAnimationFrame(loop); // pide el siguiente cuadro
  }

  requestAnimationFrame(loop);
}