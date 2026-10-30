import test from "node:test";
import assert from "node:assert/strict";
import { preparePhotoWithFallback } from "./preparePhotoFallback";
import { reusableMenuPhoto } from "./generatedMenuCache";
const file = new File(["photo"], "dish.jpg", { type: "image/jpeg" }),
  cutout = new File(["cutout"], "cutout.png", { type: "image/png" });
test("uses AI cutout when credits are available", async () => {
  const uploads: File[] = [];
  let called = 0;
  const result = await preparePhotoWithFallback(file, {
    transparent: async (blob) => (blob === file ? null : cutout),
    remove: async () => {
      called++;
      return cutout;
    },
    upload: async (blob) => {
      uploads.push(blob);
      return "saved-cutout";
    },
  });
  assert.equal(called, 1);
  assert.deepEqual(uploads, [cutout]);
  assert.equal(result.preparation, "cutout");
});
test("credit failure saves the directly uploaded original instead of blocking generation", async () => {
  const uploads: File[] = [];
  const result = await preparePhotoWithFallback(file, {
    transparent: async () => null,
    remove: async () => {
      throw new Error("The AI photo service needs credits.");
    },
    upload: async (blob) => {
      uploads.push(blob);
      return "saved-original";
    },
  });
  assert.deepEqual(uploads, [file]);
  assert.equal(result.preparation, "original");
  assert.equal(result.photoUrl, "saved-original");
  assert.match(result.fallbackReason!, /credits/);
  const cached = {
    dish: { ...result, sourcePhotoUrl: "public-photo", custom: true },
  };
  assert.equal(
    reusableMenuPhoto(cached, "dish", "public-photo")?.photoUrl,
    "saved-original",
  );
  assert.equal(
    reusableMenuPhoto(cached, "dish", "new-public-photo")?.photoUrl,
    "saved-original",
  );
});
test("transparent uploads and skipped AI batches consume no paid requests", async () => {
  let calls = 0;
  const services = {
    transparent: async () => cutout,
    remove: async () => {
      calls++;
      return cutout;
    },
    upload: async () => "saved",
  };
  assert.equal(
    (await preparePhotoWithFallback(file, services)).preparation,
    "cutout",
  );
  const skipped = await preparePhotoWithFallback(
    file,
    { ...services, transparent: async () => null },
    true,
  );
  assert.equal(skipped.preparation, "original");
  assert.equal(calls, 0);
});
test("AI invalid output falls back, but failed storage is not swallowed or retried", async () => {
  let uploads = 0;
  const services = {
    transparent: async () => null,
    remove: async () => cutout,
    upload: async () => {
      uploads++;
      throw new Error("Upload permission denied");
    },
  };
  await assert.rejects(
    preparePhotoWithFallback(file, services),
    /Upload permission denied/,
  );
  assert.equal(uploads, 1);
});
test("invalid file and unreadable local photo are rejected before any paid request", async () => {
  let paid = 0;
  const services = {
    transparent: async () => {
      throw new Error("Unreadable photo");
    },
    remove: async () => {
      paid++;
      return cutout;
    },
    upload: async () => "saved",
  };
  await assert.rejects(
    preparePhotoWithFallback(
      new File(["text"], "x.txt", { type: "text/plain" }),
      services,
    ),
    /Choose JPG/,
  );
  await assert.rejects(preparePhotoWithFallback(file, services), /Unreadable/);
  assert.equal(paid, 0);
});
