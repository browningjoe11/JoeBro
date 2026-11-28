import { checkCrew, checkTechnician, formatDays, formatHours, memoryCrews, NEW_CREW, NEW_TECHNICIAN, nextFreeColor, normalizeCrew } from ".";

describe("crew rules", () => {
  it("needs a name, a unique name, a working day and an end after the start", () => {
    const ok = { ...NEW_CREW, name: "Deck crew" };
    expect(checkCrew(ok)).toBeNull();
    expect(checkCrew({ ...ok, name: "  " })).toBe("Give the crew a name.");
    expect(checkCrew(ok, [{ id: "x", name: " deck CREW " }])).toBe("Another crew already has that name.");
    expect(checkCrew(ok, [{ id: "x", name: "Deck crew" }], "x")).toBeNull();
    expect(checkCrew({ ...ok, workDays: [] })).toBe("Pick at least one working day.");
    expect(checkCrew({ ...ok, dayStart: "15:00", dayEnd: "07:00" })).toBe("The day must end after it starts.");
    expect(checkCrew({ ...ok, color: "#ff0000" as never })).toBe("Pick a color from the palette.");
  });

  it("checks a tech's name and email", () => {
    expect(checkTechnician({ ...NEW_TECHNICIAN, fullName: "Mike" })).toBeNull();
    expect(checkTechnician(NEW_TECHNICIAN)).toBe("Enter the tech's name.");
    expect(checkTechnician({ ...NEW_TECHNICIAN, fullName: "Mike", email: "nope" })).toMatch(/valid email/);
  });

  it("tidies what gets saved", () => {
    expect(normalizeCrew({ name: " Deck ", workDays: [5, 1, 1, 3], skills: ["Decks", " Decks ", ""] })).toEqual({
      name: "Deck",
      workDays: [1, 3, 5],
      skills: ["Decks"],
    });
  });

  it("describes days and hours the way people say them", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDays([1, 2, 3, 4, 5, 6])).toBe("Mon–Sat");
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatDays([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(formatDays([6, 0])).toBe("Sat, Sun");
    expect(formatHours("07:00", "15:30")).toBe("7:00 AM – 3:30 PM");
    expect(formatHours("12:00", "23:30")).toBe("12:00 PM – 11:30 PM");
  });

  it("offers a color no active crew uses yet", () => {
    expect(nextFreeColor([])).toBe("teal");
    expect(nextFreeColor([{ color: "teal", active: true }, { color: "blue", active: true }])).toBe("green");
    expect(nextFreeColor([{ color: "teal", active: false }])).toBe("teal");
  });
});

describe("memoryCrews", () => {
  it("adds crews at the end, refuses duplicates, and keeps logins to one tech", async () => {
    const { backend } = memoryCrews();
    const crew = await backend.createCrew({ ...NEW_CREW, name: "Fence crew", color: "green" });
    const { crews } = await backend.list();
    expect(crews.at(-1)?.id).toBe(crew.id);
    await expect(backend.createCrew({ ...NEW_CREW, name: "fence crew" })).rejects.toThrow("Another crew already has that name.");

    await backend.createTechnician({ ...NEW_TECHNICIAN, fullName: "A", profileId: "p1" });
    await expect(backend.createTechnician({ ...NEW_TECHNICIAN, fullName: "B", profileId: "p1" })).rejects.toThrow(/already linked/);
  });
});
