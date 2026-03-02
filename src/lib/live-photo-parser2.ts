import {MP4, Input, BlobSource } from 'mediabunny';

/**
 * 结构化 Box 信息
 */
interface Box {
	type: string;
	start: number;
	size: number;
	data: Uint8Array;
}

/**
 * 终极 HEIC 解析与合成函数
 * @param buffer HEIC 文件的 ArrayBuffer
 */
export async function parseHeicDirectly(buffer: ArrayBuffer,file: File) {
	const input = new Input({
		    source: new BlobSource(file), // Reading from disk
		        formats: [MP4],
	});
	console.log('-------input',input)

	const u8 = new Uint8Array(buffer);
	const view = new DataView(buffer);

	// 1. 扫描顶级 Box
	const boxes: Box[] = [];
	let offset = 0;
	while (offset < u8.length) {
		if (offset + 8 > u8.length) break;
		const size = view.getUint32(offset);
		const type = String.fromCharCode(...u8.subarray(offset + 4, offset + 8));
		boxes.push({
			type,
			start: offset,
			size,
			data: u8.subarray(offset + 8, offset + size),
		});
		if (size <= 0) break;
		offset += size;
	}

	// 2. 基础验证与定位
	const ftypBox = boxes.find((b) => b.type === "ftyp");
	if (!ftypBox) throw new Error("Not a valid ISOBMFF file");

	const metaBox = boxes.find((b) => b.type === "meta");
	const mdatBox = boxes.find((b) => b.type === "mdat");
	const moovBox = boxes.find((b) => b.type === "moov");

	console.log("--------", boxes);
	if (!metaBox || !mdatBox)
		throw new Error("Missing essential HEIC boxes (meta/mdat)");

	// 3. 提取 hvcC 配置并生成动态 Codec 字符串
	const metaContent = metaBox.data.subarray(4); // Skip FullBox flags
	const hvcCPos = findPattern(metaContent, [0x68, 0x76, 0x63, 0x43]); // 'hvcC'
	const hvcCSize = new DataView(
		metaContent.buffer,
		metaContent.byteOffset + hvcCPos - 4,
	).getUint32(0);
	const description = metaContent.subarray(hvcCPos + 4, hvcCPos + hvcCSize - 4);

	// 核心补丁：自动识别 Tier (H/L) 和 Level，防止 EncodingError
	const codec = `hvc1.${description[1]}.6.${description[2] & 0x20 ? "H" : "L"}${description[12]}.B0`;

	// 4. 解码所有图片帧
	const decodedFrames = [];
	await new Promise((resolve, reject) => {
		const decoder = new VideoDecoder({
			output: (frame) => {
				decodedFrames.push(frame.clone()); // 克隆以供后续编码使用
				frame.close();
			},
			error: reject,
		});

		decoder.configure({
			codec,
			description,
			hardwareAcceleration: "prefer-hardware",
		});

		// 处理 mdat 中的多帧 (HEIF 序列通常是 [4字节长度][数据] 循环)
		let p = 8; // Skip mdat header
		const mdatU8 = mdatBox.data;
		const mdatView = new DataView(
			mdatU8.buffer,
			mdatU8.byteOffset,
			mdatU8.byteLength,
		);

		while (p < mdatU8.length) {
			if (p + 4 > mdatU8.length) break;
			const naluSize = mdatView.getUint32(p);
			if (p + 4 + naluSize > mdatU8.length) break;

			decoder.decode(
				new EncodedVideoChunk({
					type: "key",
					timestamp: decodedFrames.length * 100000, // 默认 10fps
					data: mdatU8.subarray(p + 4, p + 4 + naluSize),
				}),
			);
			p += 4 + naluSize;
		}
		decoder.flush().then(resolve).catch(reject);
	});

	if (decodedFrames.length === 0) throw new Error("No frames decoded");

	// 5. 生成首帧预览图 (封面)
	const canvas = new OffscreenCanvas(
		decodedFrames[0].displayWidth,
		decodedFrames[0].displayHeight,
	);
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(decodedFrames[0], 0, 0);
	const photoBlob = await canvas.convertToBlob({
		type: "image/jpeg",
		quality: 0.9,
	});

	// 6. 处理视频部分
	let videoBlob: Blob | null = null;

	// A 方案：原生实况照片提取 (Live Photo)
	if (moovBox) {
		videoBlob = new Blob([u8.subarray(moovBox.start - 4)], {
			type: "video/mp4",
		});
	}
	// B 方案：多帧序列合成视频 (Sequence)
	else if (decodedFrames.length > 1) {
		//  const recorder = new Recorder({
		//  width: decodedFrames[0].displayWidth,
		//      height: decodedFrames[0].displayHeight,
		//          fps: 10,
		//	          codec: 'avc1.42E01E' // 强兼容性 H.264
		//		      });
		//		          for (const frame of decodedFrames) {
		//				        await recorder.write(frame);
		//					    }
		//					    videoBlob = await recorder.stop();
	}

	// 清理内存
	decodedFrames.forEach((f) => f.close());

	return {
		photoBlob,
		photoUrl: URL.createObjectURL(photoBlob),
		videoBlob,
		videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
	};
}

/**
 * 辅助：字节搜索
 */
function findPattern(data: Uint8Array, pattern: number[]): number {
	for (let i = 0; i < data.length - pattern.length; i++) {
		if (pattern.every((b, j) => data[i + j] === b)) return i;
	}
	return -1;
}
