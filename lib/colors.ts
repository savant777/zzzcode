export const colorNames = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');
export function isBBCodeColor(value: string) { return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) || colorNames.includes(value.toLowerCase()); }
export type RGBA = { r: number; g: number; b: number; a: number };
export function parseColor(value: string): RGBA | null {
    const text = value.trim().toLowerCase();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (colorNames.includes(text) && typeof document !== 'undefined') { const ctx = document.createElement('canvas').getContext('2d'); if (ctx) { ctx.fillStyle = text; return parseColor(ctx.fillStyle) } }
    const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text);
    if (hex) { const full = hex[1].length < 5 ? [...hex[1]].map(c => c + c).join('') : hex[1]; return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 } }
    const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/.exec(text);
    if (!rgb) return null; const [r, g, b] = rgb.slice(1, 4).map(Number); const a = rgb[4] === undefined ? 1 : Number(rgb[4]); return Math.max(r, g, b) <= 255 && a <= 1 ? { r, g, b, a } : null;
}
export function formatColor({ r, g, b, a }: RGBA, mode: 'HEX' | 'RGB') {
    if (mode === 'RGB') return 'rgba(' + [Math.round(r), Math.round(g), Math.round(b), Number(a.toFixed(4))].join(', ') + ')';
    return '#' + [r, g, b, ...(a < 1 ? [a * 255] : [])].map(n => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}
