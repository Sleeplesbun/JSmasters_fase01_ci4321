# Fase 01: Apuntar al objetivo

Juego de tiro en 3D hecho con WebGL2 y TypeScript para Computación Gráfica I (CI4321).

## Integrantes

- Daniela Villalobos 
- Enrique Thiers 

## Cómo correrlo

Necesitas [Node.js](https://nodejs.org) 20.19 o más reciente.

1. Abre una terminal dentro de la carpeta del proyecto.
2. Instala las dependencias (solo la primera vez):

   ```
   npm install
   ```

3. Inicia el juego:

   ```
   npm run dev
   ```

4. Abre en el navegador la dirección que aparece en la terminal (normalmente `http://localhost:5173`).

## Controles

| Tecla | Qué hace |
|---|---|
| ← → | Mueve la torreta a la izquierda o a la derecha |
| ↑ ↓ | Sube o baja el cañón (entre 5° y 90°) |
| 1, 2, 3 | Elige el nivel de fuerza |
| F (toque) | Pasa al siguiente nivel de fuerza (1 → 2 → 3 → 1) |
| F (mantener) | Sobrecarga el cañón: tiembla y sus luces parpadean en rojo |
| Espacio | Dispara (solo si la bala está en la punta del cañón) |
| R | Reinicia: los objetivos vuelven y la bala regresa al cañón y la torreta vuelve al centro|