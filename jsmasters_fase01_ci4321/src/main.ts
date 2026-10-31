import './style.css';
import { iniciarJuego } from './escena';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (canvas) {
  iniciarJuego(canvas);
}