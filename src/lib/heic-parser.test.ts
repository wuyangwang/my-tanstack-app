import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectHeicStructure } from "@/lib/heic-parser";

function makeFtypBox(brand: string): Uint8Array {
	const size = 24;
	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, size);
	bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
	bytes.set(
		[...brand].map((c) => c.charCodeAt(0)),
		8,
	);
	return bytes;
}

describe("detectHeicStructure", () => {
	it("classifies demo heic as item-based without track structure", () => {
		const file = readFileSync("public/shelf-christmas-decoration.heic");
		const result = detectHeicStructure(new Uint8Array(file));

		expect(result.majorBrand).toBe("heic");
		expect(result.hasItemStructure).toBe(true);
		expect(result.hasTrackStructure).toBe(false);
		expect(result.videoContainerStart).toBeNull();
	});

	it("finds appended non-heif container as video candidate", () => {
		const heic = makeFtypBox("heic");
		const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const mp4 = makeFtypBox("isom");
		const moov = new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76]);

		const bytes = new Uint8Array(
			heic.length + payload.length + mp4.length + moov.length,
		);
		bytes.set(heic, 0);
		bytes.set(payload, heic.length);
		const secondStart = heic.length + payload.length;
		bytes.set(mp4, secondStart);
		bytes.set(moov, secondStart + mp4.length);

		const result = detectHeicStructure(bytes);
		expect(result.containerStarts.length).toBe(2);
		expect(result.videoContainerStart).toBe(secondStart);
	});
});
