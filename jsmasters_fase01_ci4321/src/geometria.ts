export interface Geometry {
  vertices: Float32Array;
  indices: Uint16Array;
}

// El plano para el suelo
export function buildPlane(width: number, depth: number): Geometry {
  const x = width / 2;
  const z = depth / 2;
  const vertices = new Float32Array([
    -x, 0, -z, // 0: Arriba Izquierda
    -x, 0,  z, // 1: Abajo Izquierda
     x, 0, -z, // 2: Arriba Derecha
     x, 0,  z  // 3: Abajo Derecha
  ]);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  return { vertices, indices };
}

// El cubo para la base de la torreta
export function buildBox(w: number, h: number, d: number): Geometry {
  const x = w / 2, y = h / 2, z = d / 2;
  const vertices = new Float32Array([
    -x, -y, -z,   x, -y, -z,   x,  y, -z,  -x,  y, -z, // Atrás
    -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z  // Frente
  ]);
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