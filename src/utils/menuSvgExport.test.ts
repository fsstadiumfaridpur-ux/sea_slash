import test from "node:test";
import assert from "node:assert/strict";
import { svgCanvasRecorder } from "../lib/svgCanvasRecorder";
function context() {
  return {
    fillStyle: "#fff",
    strokeStyle: "#abc",
    lineWidth: 1.5,
    textAlign: "center",
    font: "600 22px Arial",
    fillRect() {},
    fillText() {},
    drawImage() {},
    beginPath() {},
    moveTo() {},
    quadraticCurveTo() {},
    stroke() {},
    measureText() {
      return { width: 42 };
    },
  } as unknown as CanvasRenderingContext2D;
}
test("SVG has physical print dimensions and native vector text, shapes and curves", () => {
  const result = svgCanvasRecorder(context(), {
    width: 22,
    height: 20,
    title: "Menu & <special>",
  });
  const ctx = result.ctx;
  ctx.fillRect(0, 0, 1600, 1400);
  ctx.fillText("1. Chicken & Rice — ৳250", 100, 200);
  ctx.beginPath();
  ctx.moveTo(10, 20);
  ctx.quadraticCurveTo(30, 40, 50, 60);
  ctx.stroke();
  const svg = result.serialize();
  assert.match(svg, /width="22in" height="20in"/);
  assert.match(svg, /viewBox="0 0 1600 1454/);
  assert.match(svg, /<text x="100" y="200" text-anchor="middle"/);
  assert.match(svg, /Chicken &amp; Rice — ৳250/);
  assert.match(svg, /<title>Menu &amp; &lt;special&gt;<\/title>/);
  assert.match(svg, /<rect /);
  assert.match(svg, /d="M10 20 Q30 40 50 60"/);
  assert.doesNotMatch(svg, /foreignObject|<script/);
});
test("embeds photos once and references them without external image URLs", () => {
  let embedded = 0;
  const result = svgCanvasRecorder(
    context(),
    { width: 20, height: 22, title: "Menu" },
    () => {
      embedded++;
      return "data:image/png;base64,cGhvdG8=";
    },
  );
  const photo = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  result.ctx.drawImage(photo, 10, 20, 200, 100);
  result.ctx.drawImage(photo, 20, 30, 100, 50);
  const svg = result.serialize();
  assert.equal(embedded, 1);
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.equal((svg.match(/<use /g) ?? []).length, 2);
  assert.match(svg, /translate\(10 20\) scale\(0.5 0.5\)/);
  assert.match(svg, /data:image\/png;base64/);
  assert.doesNotMatch(svg, /xlink:href="https?:/);
});
test("translucent backgrounds retain opacity and text escapes XML attributes safely", () => {
  const result = svgCanvasRecorder(context(), {
    width: 20,
    height: 22,
    title: "Print",
  });
  result.ctx.fillStyle = "rgba(248, 239, 220, 0.88)";
  result.ctx.fillRect(0, 0, 100, 100);
  result.ctx.fillText('<img "x">\u0000', 10, 20);
  const svg = result.serialize();
  assert.match(svg, /fill-opacity="0.88"/);
  assert.match(svg, /&lt;img &quot;x&quot;&gt;/);
  assert.doesNotMatch(svg, /\u0000/);
  assert.equal(result.ctx.measureText("test").width, 42);
});
test("rejects photo references that cannot be embedded", () => {
  const result = svgCanvasRecorder(
    context(),
    { width: 20, height: 22, title: "Print" },
    () => "https://example.com/photo.png",
  );
  assert.throws(
    () =>
      result.ctx.drawImage(
        { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement,
        0,
        0,
        10,
        10,
      ),
    /embed/,
  );
});
