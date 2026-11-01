// src/main.ts
// Punto de entrada del programa. index.html carga este archivo.
// Importa los estilos, busca el lienzo de la página y arranca el juego.

// Vite inserta este CSS en la página al importarlo (por eso index.html no tiene <link>)
import './style.css';
import { iniciarJuego } from './escena';

// Busca el <canvas id="canvas"> definido en index.html.
// querySelector devuelve null si no lo encuentra; el <HTMLCanvasElement> le indica a
// TypeScript qué tipo de elemento se espera, para poder pasarlo a iniciarJuego.
const canvas = document.querySelector<HTMLCanvasElement>('#canvas');

// Solo se inicia el juego si el lienzo existe, para evitar errores si faltara en el HTML
if (canvas) {
  iniciarJuego(canvas);
}