export interface PreparedBoardPhoto {
  photoUrl: string;
  preparation: "cutout" | "original";
  fallbackReason?: string;
}
/** Only AI preparation may fall back; invalid inputs and storage errors still fail. */
export async function preparePhotoWithFallback(
  file: File,
  services: {
    transparent: (blob: Blob) => Promise<File | null>;
    remove: (file: File) => Promise<Blob>;
    upload: (file: File) => Promise<string>;
  },
  skipAI = false,
): Promise<PreparedBoardPhoto> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error("Choose JPG, PNG or WebP under 8 MB.");
  let cutout = await services.transparent(file);
  let fallbackReason = skipAI
    ? "AI preparation was unavailable for this batch."
    : "";
  if (!cutout && !skipAI) {
    try {
      const removed = await services.remove(file);
      cutout = await services.transparent(removed);
      if (!cutout) throw new Error("AI did not return a transparent dish.");
    } catch (error) {
      fallbackReason =
        error instanceof Error
          ? error.message
          : "AI photo preparation is unavailable.";
    }
  }
  if (cutout)
    return { photoUrl: await services.upload(cutout), preparation: "cutout" };
  return {
    photoUrl: await services.upload(file),
    preparation: "original",
    fallbackReason,
  };
}
