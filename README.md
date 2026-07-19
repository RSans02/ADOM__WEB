# Ficha externa de ADOM

Primera versión funcional basada en la ficha Excel proporcionada.

## Abrir la ficha

Abre `index.html` con el mismo navegador y perfil en el que tienes Tampermonkey y Roll20.

La ruta prevista es:

```text
file:///C:/ADOM__WEB/index.html
```

Puedes copiar todo el contenido de esta carpeta dentro de `C:\ADOM__WEB`.

## Userscript

La ficha utiliza el protocolo ya validado:

- Evento de petición: `adom-sheet:bridge-request`
- Evento de respuesta: `adom-sheet:bridge-response`
- Tipo de mensaje: `CHAT_COMMAND`
- Versión del protocolo: `1`

El userscript debe incluir:

```javascript
// @match        file:///C:/ADOM__WEB/*
```

## Funciones incluidas

- Forma humana y forma de éxtasis con aspecto visual diferenciado.
- Atributos, habilidades, talentos, hitos, drama, salud, armas, distorsión, lazos y habilidades arcanas.
- Cálculos automáticos extraídos de las fórmulas del Excel.
- Guardado automático con `localStorage`.
- Importación y exportación del personaje en JSON.
- Envío de comandos manuales al chat de Roll20.
- Botones de tirada en atributos y habilidades.
- Tiradas de daño de armas mediante una fórmula editable.
- Diseño responsive para escritorio, tablet y móvil.

## Cálculos reproducidos

- Iniciativa: `REF + INT / 2`, redondeado hacia abajo.
- Daño a distancia: `Combate / 4`, redondeado hacia abajo.
- Daño cuerpo a cuerpo: `(FOR + Combate) / 4`, redondeado hacia abajo.
- Umbral de herida: `FOR + VOL / 2`, redondeado hacia abajo.
- Resistencia total: `Umbral de herida × 3`.
- Salida de éxtasis: `10 + nivel de distorsión`.
- XP humana: atributos × 15 + habilidades × 5 + talentos integrados × 10 + lazos con nombre × 5 + experiencia libre.
- XP de éxtasis: lo anterior, sustituyendo lazos por habilidades arcanas × 5.
- Comparación de éxtasis: XP de éxtasis − distorsión × 30 + lazos humanos × 5.

## Tiradas

Los botones de atributo y habilidad usan provisionalmente:

```text
/roll <dado base>+<valor>
```

El dado base es editable en el panel de Roll20 y comienza en `1d20`. Esta fórmula se ha dejado configurable porque el Excel no define el procedimiento exacto de tirada de ADOM.

## Estructura

```text
index.html
css/
  styles.css
js/
  state.js
  calculations.js
  roll20-bridge.js
  ui.js
  app.js
```

No se usan librerías externas, compiladores ni servidor. Los archivos JavaScript se cargan como scripts clásicos para que la ficha siga funcionando mediante `file:///`.


## Cambios de reglas incorporados

- Cada habilidad incluye dos espacios fijos para talentos.
- Los hitos son exactamente seis y no se pueden eliminar.
- Los lazos son exactamente ocho y no se pueden eliminar.
- Cada forma permite marcar un único lazo como ancla.
- Las habilidades tiran `/roll {3d10dh1}kh1+MODIFICADOR`.
- Antes de una tirada de habilidad, la ficha pide el atributo y suma atributo + habilidad.
- Las tiradas de atributo conservan el dado base configurado en el panel de Roll20.

- Los lazos vacíos no suman experiencia.
- La ficha admite una imagen de personaje mediante URL pública directa.
- Los botones de tirada muestran un icono de dado.
