import { byTag, fitWithin, formatBytes, looksLikeImage, memoryPhotos, normalizeCaption, photoSummary, type NewPhoto } from ".";

const ready = (tag: "before" | "after", caption = ""): NewPhoto => ({
  full: new Blob(["x".repeat(300)], { type: "image/jpeg" }),
  thumb: new Blob(["t"], { type: "image/jpeg" }),
  width: 1600,
  height: 1200,
  takenAt: null,
  tag,
  caption,
});

describe("shrinking sizes", () => {
  it("fits a phone photo inside 1600px, keeping its shape", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges a small picture, and ignores nonsense sizes", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10000, 10, 360)).toEqual({ width: 360, height: 1 });
  });
  it("knows a picture file from other files", () => {
    expect(looksLikeImage(new File([""], "IMG_0001.HEIC"))).toBe(true);
    expect(looksLikeImage(new File([""], "a", { type: "image/jpeg" }))).toBe(true);
    expect(looksLikeImage(new File([""], "estimate.pdf", { type: "application/pdf" }))).toBe(false);
  });
  it("writes sizes the way people read them", () => {
    expect(formatBytes(312 * 1024)).toBe("312 KB");
    expect(formatBytes(1.24 * 1024 * 1024)).toBe("1.2 MB");
    expect(formatBytes(null)).toBe("");
  });
});

describe("photo lists", () => {
  it("tidies captions and cuts them at 280 characters", () => {
    expect(normalizeCaption("  Old   vanity\n removed ")).toBe("Old vanity removed");
    expect(normalizeCaption("x".repeat(300))).toHaveLength(280);
  });

  it("splits photos into before and after, oldest first, and sums them up", async () => {
    const { backend } = memoryPhotos();
    expect(photoSummary(await backend.list("t1"))).toBe("");
    await backend.add("t1", ready("after"));
    await backend.add("t1", ready("before", "Rotted sill"));
    await backend.add("t1", ready("after"));
    await backend.add("t2", ready("before"));
    const list = await backend.list("t1");
    const groups = byTag(list);
    expect(groups.before.map((p) => p.caption)).toEqual(["Rotted sill"]);
    expect(groups.after).toHaveLength(2);
    expect(groups.after[0].createdAt < groups.after[1].createdAt).toBe(true);
    expect(photoSummary(list)).toBe("1 before · 2 after");
  });

  it("re-tags, captions and removes a photo in the preview store", async () => {
    const { backend } = memoryPhotos();
    const p = await backend.add("t1", ready("before"));
    expect(p.url).toMatch(/^data:image\/jpeg/);
    expect(p.bytes).toBe(300);
    const changed = await backend.update(p, { tag: "after", caption: " New sill " });
    expect(changed).toMatchObject({ tag: "after", caption: "New sill" });
    await backend.remove(changed);
    expect(await backend.list("t1")).toEqual([]);
  });
});
