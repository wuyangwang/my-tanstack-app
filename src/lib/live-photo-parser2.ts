/**
 *  * 增强型 HEIC 解析：自动识别 Codec 并修正 Description
 *   */
export async function parseHeicDirectly(buffer: ArrayBuffer) {
	const u8 = new Uint8Array(buffer);
	const view = new DataView(buffer);

	let metaOffset = -1,
		mdatOffset = -1,
		videoFtypPos = -1;
	let i = 0;
	while (i < u8.length) {
		if (i + 8 > u8.length) break;
		const size = view.getUint32(i);
		const type = String.fromCharCode(...u8.subarray(i + 4, i + 8));
		if (type === "meta") metaOffset = i;
		if (type === "mdat") mdatOffset = i;
		if (type === "ftyp" && i > 0) videoFtypPos = i;
		if (size <= 0) break;
		i += size;
	}

	if (metaOffset === -1 || mdatOffset === -1) throw new Error("Invalid HEIC");

	// 1. 精确寻找 hvcC 并解析 Codec 字符串
	const hvcCStart = findPattern(u8, [0x68, 0x76, 0x63, 0x43], metaOffset);
	if (hvcCStart === -1) throw new Error("hvcC missing");

	const hvcCSize = view.getUint32(hvcCStart - 4);
	// WebCodecs 需要的 description 是去掉 Box Header (8字节) 后的纯数据
	const description = u8.subarray(hvcCStart + 4, hvcCStart + hvcCSize - 4);

	/**
	 * 自动生成 Codec 字符串 (hvc1.x.x.Lxx.B0)
	 * 从 hvcC 的第 1-12 字节提取 Profile, Tier, Level
	 */
	const getCodecString = (desc: Uint8Array) => {
		const profileIdc = desc[1];
		const tier = desc[2] & 0x20 ? "H" : "L";
		const levelIdc = desc[12];
		// 常见的如 hvc1.1.6.L93.B0
		return `hvc1.${profileIdc}.6.${tier}${levelIdc}.B0`;
	};

	const codec = getCodecString(description);
	console.log("Detected Codec:", codec);

	// 2. 硬件解码
	const photoBlob = await new Promise<Blob>((resolve, reject) => {
		const canvas = new OffscreenCanvas(1, 1);
		const decoder = new VideoDecoder({
			output: async (frame) => {
				canvas.width = frame.displayWidth;
				canvas.height = frame.displayHeight;
				canvas.getContext("2d")!.drawImage(frame, 0, 0);
				frame.close();
				resolve(
					await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 }),
				);
			},
			error: (e) => reject(e),
		});

		try {
			decoder.configure({
				codec: codec,
				description: description,
				hardwareAcceleration: "prefer-hardware",
			});

			// 3. 定位 mdat 内部数据起始位置
			// 有些 HEIC 在 mdat type 后还有 4 字节的保留位，这里跳过 8 字节 header
			const dataStart = mdatOffset + 8;
			const dataEnd = videoFtypPos > 0 ? videoFtypPos : u8.length;

			decoder.decode(
				new EncodedVideoChunk({
					type: "key",
					timestamp: 0,
					data: u8.subarray(dataStart, dataEnd),
				}),
			);
			decoder.flush();
		} catch (err) {
			reject(err);
		}
	});

	const videoBlob =
		videoFtypPos > 0
			? new Blob([u8.subarray(videoFtypPos - 4)], { type: "video/mp4" })
			: null;

	return {
		photoBlob,
		photoUrl: URL.createObjectURL(photoBlob),
		videoBlob,
		videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
	};
}

function findPattern(
	data: Uint8Array,
	pattern: number[],
	start: number,
): number {
	for (let i = start; i < data.length - pattern.length; i++) {
		if (pattern.every((b, j) => data[i + j] === b)) return i;
	}
	return -1;
}
