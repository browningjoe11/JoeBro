import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../App";
import { CurrentUserProvider } from "../../core/currentUser";
import type { Role } from "../../core/modules";
import { memoryPhotos, PhotosProvider, type PreparedPhoto, type TicketPhoto } from "../../core/photos";
import { PhotoBoard } from "./TicketPhotos";

/** Stand-in for the canvas shrink (jsdom has no canvas): a 1600px photo of about 300 KB. */
const fakePrepare = async (file: File): Promise<PreparedPhoto> => {
  if (file.name.endsWith(".pdf")) throw new Error(`${file.name} isn't a picture.`);
  return {
    full: new Blob([new Uint8Array(300 * 1024)], { type: "image/jpeg" }),
    thumb: new Blob(["t"], { type: "image/jpeg" }),
    width: 1600,
    height: 1200,
    takenAt: "2026-11-28T14:00:00.000Z",
  };
};
const photoFile = (name = "IMG_0001.jpg") => new File(["raw"], name, { type: "image/jpeg" });

function renderBoard(opts: { role?: Role; userId?: string | null; seed?: TicketPhoto[] } = {}) {
  const photos = memoryPhotos(opts.seed);
  render(
    <CurrentUserProvider user={{ id: opts.userId ?? null, name: "Someone", role: opts.role ?? "technician" }}>
      <PhotosProvider backend={photos.backend}>
        <PhotoBoard ticketId="t3" prepare={fakePrepare} />
      </PhotosProvider>
    </CurrentUserProvider>,
  );
  return photos;
}

const group = (tag: "Before" | "After") => screen.getByRole("region", { name: `${tag} photos` });

describe("before and after photos", () => {
  it("adds several before photos from the camera or library and shows them under Before", async () => {
    const user = userEvent.setup();
    const photos = renderBoard();
    await screen.findByText("No before photos yet.");
    await user.upload(screen.getByLabelText("Add before photos"), [photoFile("a.jpg"), photoFile("b.jpg")]);
    await waitFor(() => expect(within(group("Before")).getAllByRole("button", { name: /Open before photo/ })).toHaveLength(2));
    expect(within(group("After")).getByText("No after photos yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Photo uploads" })).not.toBeInTheDocument();
    const stored = [...photos.store.values()];
    expect(stored.map((p) => [p.tag, p.ticketId, p.bytes])).toEqual([
      ["before", "t3", 300 * 1024],
      ["before", "t3", 300 * 1024],
    ]);
  });

  it("keeps a failed upload on screen with Try again, then uploads it", async () => {
    const user = userEvent.setup();
    const photos = renderBoard();
    await screen.findByText("No after photos yet.");
    photos.control.failNext = true;
    await user.upload(screen.getByLabelText("Add after photos"), photoFile());
    expect(await screen.findByRole("alert")).toHaveTextContent("Didn't upload: No signal");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(group("After")).getAllByRole("button", { name: /Open after photo/ })).toHaveLength(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says plainly when a file isn't a picture, and Dismiss clears it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderBoard();
    await screen.findByText("No after photos yet.");
    await user.upload(screen.getByLabelText("Add after photos"), new File(["%PDF"], "quote.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("quote.pdf isn't a picture.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens a photo big, moves it to After with a caption, and removes it", async () => {
    const user = userEvent.setup();
    renderBoard({ role: "operations" });
    await screen.findByText("No before photos yet.");
    await user.upload(screen.getByLabelText("Add before photos"), photoFile());
    await user.click(await within(group("Before")).findByRole("button", { name: "Open before photo 1" }));
    const sheet = screen.getByRole("dialog", { name: "Before photo" });
    expect(within(sheet).getByText(/1600×1200 · 300 KB/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "After" }));
    await user.type(within(sheet).getByLabelText("Caption"), "New vanity in");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(group("After")).findByRole("button", { name: "Open after photo 1: New vanity in" })).toBeInTheDocument();
    expect(within(group("Before")).getByText("No before photos yet.")).toBeInTheDocument();

    await user.click(within(group("After")).getByRole("button", { name: /Open after photo 1/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(group("After")).getByText("No after photos yet.")).toBeInTheDocument();
  });

  it("lets a tech look at, but not change, a photo someone else took", async () => {
    const user = userEvent.setup();
    const seed: TicketPhoto = {
      id: "p-office",
      ticketId: "t3",
      tag: "before",
      caption: "Water damage behind the tub",
      url: "data:image/jpeg;base64,AA==",
      thumbUrl: "data:image/jpeg;base64,AA==",
      width: 1600,
      height: 1200,
      bytes: 200_000,
      takenAt: null,
      uploadedBy: "user-office",
      createdAt: "2026-11-27T12:00:00.000Z",
    };
    renderBoard({ role: "technician", userId: "user-rosa", seed: [seed] });
    await user.click(await screen.findByRole("button", { name: "Open before photo 1: Water damage behind the tub" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Water damage behind the tub")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Caption")).not.toBeInTheDocument();
  });

  it("shows the photos on the ticket screen", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tickets/1003"]}>
        <App initialRole="operations" />
      </MemoryRouter>,
    );
    const section = (await screen.findByRole("heading", { name: "Photos" })).closest("section")!;
    expect(await within(section).findByText("No before photos yet.")).toBeInTheDocument();
    expect(within(section).getByLabelText("Add after photos")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Photos" }));
    expect(within(section).queryByLabelText("Add after photos")).not.toBeVisible();
  });
});
