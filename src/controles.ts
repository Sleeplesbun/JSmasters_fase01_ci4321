// src/controles.ts
// Manejo del teclado. Distingue dos tipos de teclas:
// - Mantenidas: actúan mientras están presionadas (flechas para mover y apuntar, F para sobrecargar).
// - Pulsadas: actúan una sola vez por cada pulsación (disparar, cambiar fuerza, reiniciar).
// escena.ts consulta este estado en cada cuadro del juego.

/**
 * Estado de las teclas que se usan mantenidas: true mientras la tecla está abajo.
 * Las flechas mueven la torreta y el cañón de forma continua.
 * F también se mira aquí: un toque corto cambia la fuerza y mantenerla sobrecarga el cañón.
 */
export const teclado = {
  Izquierda: false,
  Derecha: false,
  Arriba: false,
  Abajo: false,
  F: false,
};

// Teclas presionadas desde el cuadro anterior (se vacía al final de cada cuadro).
// Un Set evita duplicados: si una tecla se presiona dos veces en el mismo cuadro, cuenta una vez.
const pulsadas = new Set<string>();

// Teclas que usa el juego. A estas se les bloquea la acción normal del navegador
// (por ejemplo, Espacio y las flechas desplazan la página).
const TECLAS_JUEGO = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyF', 'KeyR', 'Digit1', 'Digit2', 'Digit3',
]);

/**
 * Registra los eventos del teclado en la ventana. Se llama una sola vez al iniciar el juego.
 *
 * Entrada: ninguna.
 * Salida:  ninguna (actualiza el objeto teclado y el conjunto de pulsadas).
 * Qué hace: al presionar una tecla la marca como mantenida y como pulsada; al soltarla,
 *           deja de estar mantenida. Si la ventana pierde el foco, suelta todas las teclas.
 */
export function iniciarControles() {
  window.addEventListener('keydown', (e) => {
    if (TECLAS_JUEGO.has(e.code)) e.preventDefault();

    // e.code identifica la tecla física (no depende del idioma del teclado)
    if (e.code === 'ArrowLeft') teclado.Izquierda = true;
    if (e.code === 'ArrowRight') teclado.Derecha = true;
    if (e.code === 'ArrowUp') teclado.Arriba = true;
    if (e.code === 'ArrowDown') teclado.Abajo = true;
    if (e.code === 'KeyF') teclado.F = true;

    // Al mantener una tecla, el sistema repite el evento keydown varias veces por segundo
    // con e.repeat = true. Esas repeticiones no cuentan como pulsaciones nuevas.
    if (!e.repeat) pulsadas.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') teclado.Izquierda = false;
    if (e.code === 'ArrowRight') teclado.Derecha = false;
    if (e.code === 'ArrowUp') teclado.Arriba = false;
    if (e.code === 'ArrowDown') teclado.Abajo = false;
    if (e.code === 'KeyF') teclado.F = false;
  });

  // Si se cambia de ventana con una tecla presionada, el evento keyup nunca llega
  // y la tecla quedaría "pegada". Por eso, al perder el foco se sueltan todas.
  window.addEventListener('blur', () => {
    teclado.Izquierda = teclado.Derecha = teclado.Arriba = teclado.Abajo = teclado.F = false;
  });
}

/**
 * Indica si una tecla se presionó desde el cuadro anterior.
 *
 * Entrada: code, el código de la tecla (por ejemplo 'Space', 'KeyR' o 'Digit1').
 * Salida:  true si se presionó en este cuadro; false si no.
 * Qué hace: consulta el conjunto de pulsadas. Sirve para acciones que deben ocurrir
 *           una sola vez por pulsación, aunque la tecla se mantenga abajo.
 */
export function sePresiono(code: string): boolean {
  return pulsadas.has(code);
}

/**
 * Cierra el cuadro actual de entrada. Se llama al final de cada cuadro del juego.
 *
 * Entrada: ninguna.
 * Salida:  ninguna.
 * Qué hace: vacía el conjunto de pulsadas. Así una pulsación que no se usó en este
 *           cuadro (por ejemplo, Espacio con la bala en el aire) no se acumula para después.
 */
export function finDeCuadro() {
  pulsadas.clear();
}