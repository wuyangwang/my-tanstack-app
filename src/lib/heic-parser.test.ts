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

function makeBox(
	type: string,
	payload: Uint8Array = new Uint8Array(),
): Uint8Array {
	const size = 8 + payload.length;
	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, size);
	bytes.set(
		[...type].map((c) => c.charCodeAt(0)),
		4,
	);
	bytes.set(payload, 8);
	return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function makeHdlrBox(handlerType: string): Uint8Array {
	const payload = new Uint8Array(20);
	payload.set(
		[...handlerType].map((c) => c.charCodeAt(0)),
		8,
	);
	return makeBox("hdlr", payload);
}

describe("detectHeicStructure", () => {
	it("classifies item-based heic without track structure", () => {
		const heic = makeFtypBox("heic");
		const meta = makeBox("meta", new Uint8Array([0, 0, 0, 0]));
		const iinf = makeBox("iinf", new Uint8Array([0, 0, 0, 0]));
		const bytes = concatBytes(heic, meta, iinf);
		const result = detectHeicStructure(bytes);

		expect(result.majorBrand).toBe("heic");
		expect(result.hasItemStructure).toBe(true);
		expect(result.hasTrackStructure).toBe(false);
		expect(result.videoContainerStart).toBeNull();
	});

	it("finds appended non-heif video container from moov/trak/hdlr metadata", () => {
		const heic = makeFtypBox("heic");
		const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const mp4 = makeFtypBox("isom");
		const trak = makeBox("trak", makeBox("mdia", makeHdlrBox("vide")));
		const moov = makeBox("moov", trak);
		const mdat = makeBox("mdat", new Uint8Array([1, 2, 3, 4]));

		const bytes = new Uint8Array(
			heic.length + payload.length + mp4.length + moov.length + mdat.length,
		);
		bytes.set(heic, 0);
		bytes.set(payload, heic.length);
		const secondStart = heic.length + payload.length;
		bytes.set(mp4, secondStart);
		bytes.set(moov, secondStart + mp4.length);
		bytes.set(mdat, secondStart + mp4.length + moov.length);

		const result = detectHeicStructure(bytes);
		expect(result.containerStarts.length).toBe(2);
		expect(result.videoContainerStart).toBe(secondStart);
	});
});
