// src/main.ts
import './style.css';
import { iniciarJuego } from './escena';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');

if (canvas) {
  iniciarJuego(canvas);
} else {
  console.error('No se encontró el elemento canvas en el HTML');
}