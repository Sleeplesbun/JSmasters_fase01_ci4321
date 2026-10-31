

// Estado de las teclas que nos importan
export const teclado = {
  Izquierda: false,
  Derecha: false,
  Arriba: false,
  Abajo: false,
  Espacio: false,
  F: false,
  R: false
};

export function iniciarControles() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') teclado.Izquierda = true;
    if (e.code === 'ArrowRight') teclado.Derecha = true;
    if (e.code === 'ArrowUp') teclado.Arriba = true;
    if (e.code === 'ArrowDown') teclado.Abajo = true;
    if (e.code === 'Space') teclado.Espacio = true;
    if (e.code === 'KeyF') teclado.F = true;
    if (e.code === 'KeyR') teclado.R = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') teclado.Izquierda = false;
    if (e.code === 'ArrowRight') teclado.Derecha = false;
    if (e.code === 'ArrowUp') teclado.Arriba = false;
    if (e.code === 'ArrowDown') teclado.Abajo = false;
    if (e.code === 'Space') teclado.Espacio = false;
    if (e.code === 'KeyF') teclado.F = false;
    if (e.code === 'KeyR') teclado.R = false;
  });
}