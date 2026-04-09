import { describe, expect, it } from "vitest";
import {
	detectHeicStructure,
	extractHeifItemsFromMdat,
} from "@/lib/heic-parser";

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

function makeInfeBox(itemId: number, itemType: string): Uint8Array {
	const payload = new Uint8Array(4 + 2 + 2 + 4);
	payload[0] = 2; // version
	const view = new DataView(payload.buffer);
	view.setUint16(4, itemId);
	view.setUint16(6, 0);
	payload.set(
		[...itemType].map((c) => c.charCodeAt(0)),
		8,
	);
	return makeBox("infe", payload);
}

function makeIinfBox(...infeBoxes: Uint8Array[]): Uint8Array {
	const fullHeader = new Uint8Array([0, 0, 0, 0]); // version+flags
	const entryCount = new Uint8Array(2);
	new DataView(entryCount.buffer).setUint16(0, infeBoxes.length);
	return makeBox("iinf", concatBytes(fullHeader, entryCount, ...infeBoxes));
}

function makeIlocBox(
	entries: { itemId: number; offset: number; length: number }[],
): Uint8Array {
	const header = new Uint8Array([0, 0, 0, 0, 0x44, 0x00]); // version=0, off/len/base=4
	const itemCount = new Uint8Array(2);
	new DataView(itemCount.buffer).setUint16(0, entries.length);

	const parts: Uint8Array[] = [header, itemCount];
	for (const entry of entries) {
		const block = new Uint8Array(2 + 2 + 4 + 2 + 4 + 4);
		const view = new DataView(block.buffer);
		let o = 0;
		view.setUint16(o, entry.itemId);
		o += 2;
		view.setUint16(o, 0); // data_reference_index
		o += 2;
		view.setUint32(o, 0); // base_offset
		o += 4;
		view.setUint16(o, 1); // extent_count
		o += 2;
		view.setUint32(o, entry.offset);
		o += 4;
		view.setUint32(o, entry.length);
		parts.push(block);
	}

	return makeBox("iloc", concatBytes(...parts));
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

	it("extracts item payloads from mdat using iloc offsets", () => {
		const ftyp = makeFtypBox("heic");
		const item1 = new Uint8Array([1, 2, 3]);
		const item2 = new Uint8Array([10, 11, 12, 13]);
		const mdatPayload = concatBytes(
			new Uint8Array([99, 98]),
			item1,
			new Uint8Array([88]),
			item2,
		);
		const mdat = makeBox("mdat", mdatPayload);

		const iinf = makeIinfBox(makeInfeBox(1, "hvc1"), makeInfeBox(2, "hvc1"));
		const placeholderIloc = makeIlocBox([
			{ itemId: 1, offset: 0, length: item1.length },
			{ itemId: 2, offset: 0, length: item2.length },
		]);
		const placeholderMeta = makeBox(
			"meta",
			concatBytes(new Uint8Array([0, 0, 0, 0]), iinf, placeholderIloc),
		);
		const mdatDataStart = ftyp.length + placeholderMeta.length + 8;
		const iloc = makeIlocBox([
			{ itemId: 1, offset: mdatDataStart + 2, length: item1.length },
			{
				itemId: 2,
				offset: mdatDataStart + 2 + item1.length + 1,
				length: item2.length,
			},
		]);
		const meta = makeBox(
			"meta",
			concatBytes(new Uint8Array([0, 0, 0, 0]), iinf, iloc),
		);
		const bytes = concatBytes(ftyp, meta, mdat);

		const extracted = extractHeifItemsFromMdat(bytes);
		expect(extracted).toHaveLength(2);
		expect(extracted.every((item) => item.inMdat)).toBe(true);
		expect(Array.from(extracted[0].bytes)).toEqual(Array.from(item1));
		expect(Array.from(extracted[1].bytes)).toEqual(Array.from(item2));
		expect(extracted[0].itemType).toBe("hvc1");
		expect(extracted[1].itemType).toBe("hvc1");
	});
});
