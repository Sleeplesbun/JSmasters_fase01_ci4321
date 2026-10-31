// Teclas MANTENIDAS: movimiento continuo mientras la tecla está abajo
export const teclado = {
  Izquierda: false,
  Derecha: false,
  Arriba: false,
  Abajo: false,
};

// Teclas PRESIONADAS en este cuadro: acciones de una sola vez (disparar, fuerza, reiniciar)
const pulsadas = new Set<string>();

// Teclas del juego: se bloquea su acción por defecto en el navegador (p. ej. Espacio hace scroll)
const TECLAS_JUEGO = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyF', 'KeyR', 'Digit1', 'Digit2', 'Digit3',
]);

export function iniciarControles() {
  window.addEventListener('keydown', (e) => {
    if (TECLAS_JUEGO.has(e.code)) e.preventDefault();

    if (e.code === 'ArrowLeft') teclado.Izquierda = true;
    if (e.code === 'ArrowRight') teclado.Derecha = true;
    if (e.code === 'ArrowUp') teclado.Arriba = true;
    if (e.code === 'ArrowDown') teclado.Abajo = true;

    // e.repeat es true cuando el sistema repite la tecla por mantenerla: eso no cuenta como nueva pulsación
    if (!e.repeat) pulsadas.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') teclado.Izquierda = false;
    if (e.code === 'ArrowRight') teclado.Derecha = false;
    if (e.code === 'ArrowUp') teclado.Arriba = false;
    if (e.code === 'ArrowDown') teclado.Abajo = false;
  });

  // Si la ventana pierde el foco con una flecha abajo, nunca llega el keyup: se sueltan todas
  window.addEventListener('blur', () => {
    teclado.Izquierda = teclado.Derecha = teclado.Arriba = teclado.Abajo = false;
  });
}

// ¿Se presionó esta tecla desde el cuadro anterior?
export function sePresiono(code: string): boolean {
  return pulsadas.has(code);
}

// Se llama al final de cada cuadro: las pulsaciones no usadas se descartan
export function finDeCuadro() {
  pulsadas.clear();
}