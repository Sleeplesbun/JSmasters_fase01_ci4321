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

// El cubo para la base de la torreta y el cañón
export function buildBox(w: number, h: number, d: number): Geometry {
  const x = w / 2, y = h / 2, z = d / 2;
  const vertices = new Float32Array([
    -x, -y, -z,   x, -y, -z,   x,  y, -z,  -x,  y, -z, // Atrás
    -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z  // Frente
  ]);
  const indices = new Uint16Array([
    0, 1, 2,  2, 3, 0, // Atrás
    5, 4, 7,  7, 6, 5, // Frente
    4, 0, 3,  3, 7, 4, // Izquierda
    1, 5, 6,  6, 2, 1, // Derecha
    3, 2, 6,  6, 7, 3, // Arriba
    4, 5, 1,  1, 0, 4  // Abajo
  ]);
  return { vertices, indices };
}

// La esfera para los objetivos y el proyectil
export function buildSphere(radius: number, latBands: number, lonBands: number): Geometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      vertices.push(radius * x, radius * y, radius * z);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;

      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}