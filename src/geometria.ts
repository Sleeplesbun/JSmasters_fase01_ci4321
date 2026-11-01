// src/geometria.ts
// Generación de las figuras básicas del juego (plano, caja y esfera).
// Cada función calcula los vértices y los índices de su figura; después
// escena.ts los sube a la GPU y los reutiliza para dibujar todos los objetos
// cambiando solo su posición, tamaño y color.

/**
 * Datos de una figura lista para enviarse a la GPU.
 * - vertices: posiciones x, y, z seguidas (cada 3 números forman un vértice).
 * - indices: de 3 en 3, indican qué vértices forman cada triángulo.
 */
export interface Geometry {
  vertices: Float32Array;
  indices: Uint16Array;
}

/**
 * Crea un plano horizontal (sobre y = 0) centrado en el origen. Se usa para el suelo.
 *
 * Entrada: width (ancho en X) y depth (profundidad en Z).
 * Salida:  una Geometry con 4 vértices y 2 triángulos.
 * Qué hace: coloca un vértice en cada esquina y divide el rectángulo en dos
 *           triángulos, ordenados en sentido antihorario vistos desde arriba
 *           para que su cara visible apunte hacia el cielo.
 */
export function buildPlane(width: number, depth: number): Geometry {
  // Se usa la mitad de cada medida para que el plano quede centrado en el origen
  const x = width / 2;
  const z = depth / 2;
  const vertices = new Float32Array([
    -x, 0, -z, // 0: esquina del fondo, izquierda
    -x, 0,  z, // 1: esquina del frente, izquierda
     x, 0, -z, // 2: esquina del fondo, derecha
     x, 0,  z  // 3: esquina del frente, derecha
  ]);
  // Dos triángulos que comparten la diagonal 1-2
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  return { vertices, indices };
}

/**
 * Crea una caja (prisma rectangular) centrada en el origen.
 * Con medidas 1×1×1 es el cubo que se reutiliza, escalado, para el cuerpo,
 * la cabeza, el cañón, los soportes y las barras de fuerza.
 *
 * Entrada: w (ancho en X), h (alto en Y) y d (profundidad en Z).
 * Salida:  una Geometry con 8 vértices y 12 triángulos (2 por cada cara).
 * Qué hace: coloca un vértice en cada esquina y arma las 6 caras. Los triángulos
 *           van en sentido antihorario vistos desde afuera de la caja, así la
 *           cara visible de cada uno apunta hacia el exterior.
 */
export function buildBox(w: number, h: number, d: number): Geometry {
  // Mitades de cada medida: las esquinas quedan a ±x, ±y, ±z del centro
  const x = w / 2, y = h / 2, z = d / 2;
  const vertices = new Float32Array([
    -x, -y, -z,   x, -y, -z,   x,  y, -z,  -x,  y, -z, // 0-3: cara de atrás (z negativa)
    -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z  // 4-7: cara de adelante (z positiva)
  ]);
  // Cada cara usa 4 de los 8 vértices y se divide en 2 triángulos
  const indices = new Uint16Array([
    0, 2, 1,  2, 0, 3, // Atrás
    5, 7, 4,  7, 5, 6, // Frente
    4, 3, 0,  3, 4, 7, // Izquierda
    1, 6, 5,  6, 1, 2, // Derecha
    3, 6, 2,  6, 3, 7, // Arriba
    4, 1, 5,  1, 4, 0  // Abajo
  ]);
  return { vertices, indices };
}

/**
 * Crea una esfera centrada en el origen. Con radio 1 es la que se reutiliza,
 * escalada, para los objetivos, la bala y las explosiones.
 *
 * Entrada: radius (radio), latBands (cantidad de franjas horizontales, de polo a polo)
 *          y lonBands (cantidad de divisiones alrededor del eje vertical).
 * Salida:  una Geometry con (latBands + 1) × (lonBands + 1) vértices.
 * Qué hace: recorre la esfera como si fuera un globo terráqueo, con paralelos
 *           (latitud) y meridianos (longitud). Cada cruce es un vértice, y cada
 *           casilla entre cuatro vértices se divide en dos triángulos.
 *           A más franjas, más redonda se ve la esfera, pero tiene más triángulos.
 */
export function buildSphere(radius: number, latBands: number, lonBands: number): Geometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  // 1) Vértices: un recorrido por paralelos y, dentro de cada uno, por meridianos
  for (let lat = 0; lat <= latBands; lat++) {
    // theta: ángulo desde el polo norte (0) hasta el polo sur (π)
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta); // radio del paralelo actual (0 en los polos, 1 en el ecuador)
    const cosTheta = Math.cos(theta); // altura del paralelo actual (1 arriba, -1 abajo)

    for (let lon = 0; lon <= lonBands; lon++) {
      // phi: ángulo alrededor del eje vertical, una vuelta completa (0 a 2π)
      const phi = (lon * 2 * Math.PI) / lonBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      // Punto de la esfera de radio 1 (coordenadas esféricas pasadas a x, y, z)
      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = -sinPhi * sinTheta; // con signo negativo los triángulos quedan en sentido antihorario vistos desde afuera

      vertices.push(radius * x, radius * y, radius * z);
    }
  }

  // 2) Triángulos: cada casilla de la cuadrícula se divide en dos.
  //    Cada paralelo tiene lonBands + 1 vértices (el último repite la posición del primero
  //    para cerrar la vuelta), por eso se salta esa cantidad para bajar al paralelo siguiente.
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon; // vértice de la casilla en el paralelo de arriba
      const second = first + lonBands + 1;      // vértice justo debajo, en el paralelo siguiente

      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}