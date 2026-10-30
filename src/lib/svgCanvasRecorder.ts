/** Records the print renderer's drawing operations as native SVG elements. */
const xml = (value: unknown) =>
  String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function paint(value: string | CanvasGradient | CanvasPattern, kind = "fill") {
  const color = String(value),
    rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  return rgba
    ? `${kind}="rgb(${rgba[1]},${rgba[2]},${rgba[3]})" ${kind}-opacity="${rgba[4]}"`
    : `${kind}="${xml(color)}"`;
}
function embedPhoto(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not embed a photo in the SVG.");
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export function svgCanvasRecorder(
  context: CanvasRenderingContext2D,
  options: { width: number; height: number; title: string },
  embed: (image: HTMLImageElement) => string = embedPhoto,
) {
  const elements: string[] = [],
    definitions: string[] = [];
  const images = new Map<HTMLImageElement, string>();
  let path = "";
  const methods: Record<string, (...args: any[]) => void> = {
    fillRect(x: number, y: number, width: number, height: number) {
      elements.push(
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${paint(context.fillStyle)}/>`,
      );
    },
    fillText(text: string, x: number, y: number) {
      const anchor =
        context.textAlign === "center"
          ? "middle"
          : ["right", "end"].includes(context.textAlign)
            ? "end"
            : "start";
      elements.push(
        `<text x="${x}" y="${y}" text-anchor="${anchor}" style="font:${xml(context.font)}" ${paint(context.fillStyle)} xml:space="preserve">${xml(text)}</text>`,
      );
    },
    drawImage(
      image: HTMLImageElement,
      x: number,
      y: number,
      width: number,
      height: number,
    ) {
      let id = images.get(image);
      if (!id) {
        id = `photo-${images.size}`;
        const data = embed(image);
        if (!data.startsWith("data:image/png;base64,"))
          throw new Error("Could not embed an SVG photo.");
        definitions.push(
          `<image id="${id}" width="${image.naturalWidth}" height="${image.naturalHeight}" xlink:href="${xml(data)}"/>`,
        );
        images.set(image, id);
      }
      elements.push(
        `<use xlink:href="#${id}" transform="translate(${x} ${y}) scale(${width / image.naturalWidth} ${height / image.naturalHeight})"/>`,
      );
    },
    beginPath() {
      path = "";
    },
    moveTo(x: number, y: number) {
      path += `M${x} ${y} `;
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      path += `Q${cx} ${cy} ${x} ${y} `;
    },
    stroke() {
      elements.push(
        `<path d="${path.trim()}" fill="none" ${paint(context.strokeStyle, "stroke")} stroke-width="${context.lineWidth}"/>`,
      );
    },
  };
  const ctx = new Proxy(context, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args: any[]) => {
        if (typeof key === "string" && methods[key]) methods[key](...args);
        return value.apply(target, args);
      };
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  return {
    ctx,
    serialize() {
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${options.width}in" height="${options.height}in" viewBox="0 0 1600 ${(1600 * options.height) / options.width}" version="1.1"><title>${xml(options.title)}</title><desc>Print menu. Text and shapes are vector; original photos are embedded PNG images. Print at actual size.</desc><defs>${definitions.join("")}</defs>${elements.join("")}</svg>`;
    },
  };
}
