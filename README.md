# Ficha externa de ADOM

Primera versión funcional basada en la ficha Excel proporcionada.

## Instalación para jugadores

La ficha publicada no requiere descarga. Cada jugador debe abrir el asistente:

```text
https://adom-web.vercel.app/instalar.html
```

El asistente detecta el navegador, enlaza a la instalación oficial de Tampermonkey, instala el puente ADOM con un clic y comprueba la conexión real con una partida de Roll20 sin escribir mensajes en el chat.

La ficha y Roll20 deben abrirse con el mismo navegador y perfil. En Chrome y otros navegadores Chromium recientes puede ser necesario activar `Permitir scripts de usuario` en los detalles de Tampermonkey o habilitar el modo de desarrollador de la página de extensiones.

Desde la propia ficha se puede volver al asistente mediante `Opciones → Configurar Roll20` o desde el enlace del panel de chat.

Para desarrollo local también se puede abrir `index.html` con el mismo navegador y perfil en el que estén Tampermonkey y Roll20.

## Userscript

La ficha utiliza el protocolo ya validado:

- Evento de petición: `adom-sheet:bridge-request`
- Evento de respuesta: `adom-sheet:bridge-response`
- Tipos de mensaje: `PING`, `CHAT_COMMAND` y `DAMAGE_ROLL`
- Versión del protocolo: `3`

El userscript debe incluir:

```javascript
// @match        https://adom-web.vercel.app/*
// @match        http://127.0.0.1:5500/*
// @match        http://localhost:5500/*
```

## Funciones incluidas

- Forma humana y forma de éxtasis con aspecto visual diferenciado.
- Atributos, habilidades, talentos, hitos, drama, salud, armas, distorsión, lazos y habilidades arcanas.
- Cálculos automáticos extraídos de las fórmulas del Excel.
- Guardado automático con `localStorage`.
- Selector de personajes en la cabecera para crear, alternar y eliminar varias fichas independientes.
- Organización de personajes por campañas y carpetas, con buscador por nombre y movimiento entre carpetas.
- Las eliminaciones destructivas exigen escribir manualmente `ELIMINAR` antes de continuar.
- La opción `Restablecer` elimina todas las campañas, carpetas y personajes y crea una estructura inicial vacía.
- Si se elimina el último personaje o campaña, la aplicación genera automáticamente un elemento vacío de sustitución.
- Las carpetas son opcionales: los personajes no asignados permanecen en la categoría interna `Sin carpeta`, y al eliminar la última carpeta no se crea otra automáticamente.
- Las fichas guardadas por versiones anteriores se migran automáticamente a `Mi campaña / Personajes`.
- Migración automática del personaje guardado por versiones anteriores al nuevo listado de personajes.
- La primera visita carga una ficha vacía si el navegador no tiene ningún personaje guardado.
- Importación y exportación en JSON de un personaje individual o de una campaña completa con sus carpetas y personajes.
- Importación de cualquier `.xlsx` basado en la plantilla ADOM con las hojas `Forma humana` y `Forma de Éxtasis`; se carga en el personaje seleccionado e incluye la imagen incrustada cuando es compatible.
- Chat de Roll20 integrado: historial sincronizado, mensajes y comandos desde la ficha.
- Antes de enviar, el puente busca el nombre de la ficha activa en `Hablar como` y selecciona automáticamente el personaje coincidente.
- Las tiradas del chat muestran su fórmula, los dados individuales y el total con formato claro; los críticos aparecen en verde y las pifias en rojo.
- Botones de tirada en atributos y habilidades.
- Tiradas de daño de armas mediante dados `m`, `c` y `M`, con selector de daño a distancia o cuerpo a cuerpo.
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

Las habilidades usan:

```text
{3d10dh1}kh1+<habilidad>+<atributo>
```

Los atributos conservan internamente el dado base existente. Para el daño, Roll20 ejecuta `/roll {3d10dh1}kh1+habilidad+atributo`: muestra la tirada completa con el nombre del arma, descarta el mayor y el menor para la comprobación y suma el dado central + habilidad + atributo. El userscript recoge los tres dados nuevos del chat y la ficha los ordena como `m`, `c` y `M`. La fórmula del arma solo contiene esos símbolos; después se suma automáticamente el daño a distancia o cuerpo a cuerpo elegido en su selector y se envía al chat `Nombre del arma: Daño -> resultado`.

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
- La pista de Drama es compartida entre la forma humana y la forma de éxtasis.
- Drama y Éxtasis funcionan como pistas acumulativas: marcar rellena hasta la casilla elegida y desmarcar vacía desde esa casilla en adelante.
- Los atributos y las habilidades se reordenan mediante asas de seis puntos y transiciones animadas. En los atributos aparece a la izquierda de su código; en las habilidades, bajo la flecha curva y a la izquierda del primer talento.
- El orden de atributos y habilidades puede vincularse por separado entre la forma humana y la forma de éxtasis mediante los controles de cadena; sus valores siguen siendo independientes.
- Los encabezados de atributos, habilidades, lazos y habilidades arcanas muestran también la experiencia gastada según su coste.
- Los textos descriptivos de los atributos se comparten entre forma humana y éxtasis; sus valores numéricos siguen siendo independientes.
- Los hitos son exactamente seis y no se pueden eliminar.
- El campo manual de Experiencia admite `-1` como valor mínimo y se comparte entre las formas humana y de éxtasis.
- El panel completo de Salud es compartido entre ambas formas; el umbral y la resistencia total usan los atributos de la forma humana.
- Los lazos son exactamente ocho y no se pueden eliminar.
- Los encabezados de Hitos y Lazos humanos muestran cuántas filas están rellenadas respecto al total disponible.
- Cada forma permite marcar un único lazo como ancla.
- Las habilidades sin talento tiran `/roll {3d10dh1}kh1+MODIFICADOR`; al usar un talento cambian a `/roll {3d10dh1}kh2+MODIFICADOR` para sumar tambiÃ©n el dado pequeÃ±o.
- Antes de una tirada de habilidad, la ficha pide el atributo, permite elegir uno de los talentos de la habilidad y ofrece un modificador extra temporal que empieza siempre en 0.
- En las tiradas de armas y ataques se elige primero el atributo y después la habilidad.
- La primera habilidad arcana es siempre la innata y no se puede eliminar.
- La primera fila de armas o ataques siempre existe y no se puede eliminar.
- Las tiradas de atributo conservan el dado base interno existente.

- Los lazos vacíos no suman experiencia.
- La ficha admite una imagen de personaje mediante URL pública directa, con encuadre por arrastre y zoom persistente.
- Los controles de la imagen permanecen bloqueados y ocultos hasta hacer doble clic sobre la foto; otro doble clic vuelve a bloquearlos.
- El marco de la imagen puede mostrarse cuadrado o en formato vertical 3:4.
- Los colores principales y de fondo de la forma humana y la forma de éxtasis se pueden configurar por separado.
- El botón Compartir copia un enlace comprimido de solo lectura sin edición ni tiradas e incluye la foto, su encuadre, marco, colores y el resto de la ficha. Los enlaces antiguos sin comprimir siguen siendo compatibles. Para usarlo entre equipos, la aplicación debe estar publicada por HTTP/HTTPS y la foto debe usar una URL pública directa.
- El daño usa fórmulas como `MMm+5`: `m`, `c` y `M` representan el dado menor, central y mayor de una única tirada de 3d10.
- Armas y ataques son compartidos entre la forma humana y la forma de éxtasis.
- La forma humana conserva 8 lazos. Éxtasis refleja el lazo humano marcado como ancla; si no hay ancla, no muestra ninguno.
- Los botones de tirada muestran un icono de dado.

- El bloque de Salud se ha recolocado debajo de Hitos para aprovechar mejor el espacio.
