import { createServerFn } from "@tanstack/react-start";

export interface DouyinVideoInfo {
	url: string;
	wm_url: string;
	title: string;
	video_id: string;
	cover?: string;
}

const HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
	Referer: "https://www.douyin.com/",
};

export const parseDouyinShareUrl = createServerFn({ method: "POST" })
	.inputValidator((data: { shareText: string }) => data)
	.handler(async ({ data }) => {
		const { shareText } = data;
		// 提取分享链接
		const urlRegex =
			/http[s]?:\/\/(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*(),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+/;
		const match = shareText.match(urlRegex);
		if (!match) {
			throw new Error("未找到有效的分享链接");
		}

		const shareUrl = match[0];

		try {
			// 获取重定向后的 URL
			const shareResponse = await fetch(shareUrl, {
				headers: HEADERS,
				redirect: "follow",
			});

			// 从 URL 中提取 video_id
			// 可能是 https://www.douyin.com/video/7462000000000000000
			const responseUrl = new URL(shareResponse.url);
			const videoIdMatch = shareResponse.url.match(/\/video\/(\d+)/);
			const videoId =
				responseUrl.searchParams.get("modal_id") ||
				(videoIdMatch
					? videoIdMatch[1]
					: shareResponse.url.split("?")[0].split("/").filter(Boolean).pop());

			if (!videoId) {
				throw new Error("无法解析视频 ID");
			}

			const infoUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
			const response = await fetch(infoUrl, { headers: HEADERS });
			if (!response.ok) {
				throw new Error(`获取视频页面失败: ${response.status}`);
			}

			const html = await response.text();

			// 解析 window._ROUTER_DATA
			const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)\s*<\/script>/s;
			const findRes = html.match(pattern);

			if (!findRes || !findRes[1]) {
				throw new Error("从HTML中解析视频信息失败");
			}

			const jsonData = JSON.parse(findRes[1].trim());
			const VIDEO_ID_PAGE_KEY = "video_(id)/page";
			const NOTE_ID_PAGE_KEY = "note_(id)/page";

			let originalVideoInfo: any;
			const loaderData = jsonData.loaderData;

			if (loaderData[VIDEO_ID_PAGE_KEY]) {
				originalVideoInfo = loaderData[VIDEO_ID_PAGE_KEY].videoInfoRes;
			} else if (loaderData[NOTE_ID_PAGE_KEY]) {
				originalVideoInfo = loaderData[NOTE_ID_PAGE_KEY].videoInfoRes;
			} else {
				throw new Error("无法从JSON中解析视频或图集信息");
			}

			const data = originalVideoInfo.item_list[0];
			// console.log(data, originalVideoInfo, jsonData, "---------");
			// 获取视频信息
			const wmUrl = data.video.play_addr.url_list[0];
			const videoUrl = wmUrl.replace("playwm", "play");
			const cover = data.video.cover.url_list[0];
			let desc = data.desc?.trim() || `douyin_${videoId}`;

			// 替换文件名中的非法字符
			desc = desc.replace(/[\\/:*?"<>|]/g, "_");

			return {
				url: videoUrl,
				wm_url: wmUrl,
				title: desc,
				video_id: videoId,
				cover,
			};
		} catch (error) {
			console.error("Douyin parse error:", error);
			throw error instanceof Error ? error : new Error("解析失败");
		}
	});
