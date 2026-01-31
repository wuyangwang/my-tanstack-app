import { createFileRoute } from "@tanstack/react-router";
import { Copy, ExternalLink, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { type DouyinVideoInfo, parseDouyinShareUrl } from "./-function";

export const Route = createFileRoute("/douyin-tool/")({
	component: DouyinTool,
});

function DouyinTool() {
	const [shareText, setShareText] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<DouyinVideoInfo | null>(null);

	const handleParse = async () => {
		if (!shareText.trim()) {
			toast.error("请输入分享链接");
			return;
		}

		setLoading(true);
		setResult(null);
		try {
			const info = await parseDouyinShareUrl({ data: { shareText } });
			setResult(info);
			toast.success("解析成功");
		} catch (error) {
			console.error(error);
			toast.error(
				error instanceof Error
					? error.message
					: "解析失败，请检查链接是否正确。",
			);
		} finally {
			setLoading(false);
		}
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("已复制到剪贴板");
	};

	return (
		<div className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
			<div className="flex flex-col items-center space-y-4 text-center">
				<h1 className="bg-gradient-to-r from-red-500 to-pink-600 bg-clip-text font-extrabold text-4xl text-transparent tracking-tight lg:text-5xl">
					抖音视频提取
				</h1>
				<p className="max-w-lg text-muted-foreground">
					解析抖音分享链接，获取无水印和有水印视频地址。
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>粘贴分享链接</CardTitle>
					<CardDescription>
						在此粘贴从抖音 App 复制的分享文本或链接
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Textarea
						placeholder="例如：6.92 p@y.pg 01/21 Vmu:/ 复制打开抖音，看看【九月的作品】白露  # 传统文化 # 节气 # 治愈系风景  https://v.douyin.com/iPxxxx/"
						value={shareText}
						onChange={(e) => setShareText(e.target.value)}
						className="min-h-[120px]"
					/>
					<Button
						onClick={handleParse}
						disabled={loading}
						className="w-full bg-red-600 font-bold hover:bg-red-700"
					>
						{loading ? "正在解析..." : "立即解析"}
					</Button>
				</CardContent>
			</Card>

			{loading && (
				<div className="space-y-4">
					<Skeleton className="h-[200px] w-full" />
				</div>
			)}

			{result && (
				<div className="fade-in slide-in-from-bottom-4 grid animate-in gap-6 duration-500">
					<Card className="overflow-hidden">
						<div className="grid md:grid-cols-2">
							<div className="group relative flex aspect-video items-center justify-center bg-black">
								{result.cover && (
									<img
										src={result.cover}
										alt={result.title}
										className="h-full w-full object-contain"
									/>
								)}
								<div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
									<Video className="h-12 w-12 text-white" />
								</div>
							</div>
							<div className="flex flex-col justify-center p-6">
								<h3 className="line-clamp-2 font-bold text-xl">
									{result.title}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm">
									视频 ID: {result.video_id}
								</p>
							</div>
						</div>
						<CardContent className="space-y-4 pt-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<p className="font-medium text-sm">无水印视频</p>
									<div className="flex gap-2">
										<Button
											variant="outline"
											className="flex-1"
											onClick={() => window.open(result.url, "_blank")}
										>
											<ExternalLink className="mr-2 h-4 w-4" /> 预览
										</Button>
										<Button
											variant="secondary"
											onClick={() => copyToClipboard(result.url)}
										>
											<Copy className="h-4 w-4" />
										</Button>
									</div>
								</div>
								<div className="space-y-2">
									<p className="font-medium text-sm">有水印视频</p>
									<div className="flex gap-2">
										<Button
											variant="outline"
											className="flex-1"
											onClick={() => window.open(result.wm_url, "_blank")}
										>
											<ExternalLink className="mr-2 h-4 w-4" /> 预览
										</Button>
										<Button
											variant="secondary"
											onClick={() => copyToClipboard(result.wm_url)}
										>
											<Copy className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
