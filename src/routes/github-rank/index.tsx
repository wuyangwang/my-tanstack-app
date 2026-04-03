import { createFileRoute } from "@tanstack/react-router";
import {
	CircleDot,
	Code2,
	ExternalLink,
	GitFork,
	Loader2,
	Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import * as m from "@/paraglide/messages";
import { fetchGithubRepoMetrics, type GithubRepoMetrics } from "./-function";

export const Route = createFileRoute("/github-rank/")({
	component: GithubRankPage,
});

function GithubRankPage() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [rows, setRows] = useState<GithubRepoMetrics[]>([]);

	const loadRepos = async () => {
		setLoading(true);
		setError("");

		try {
			const result = await fetchGithubRepoMetrics();
			setRows(result);
		} catch (fetchError) {
			console.error(fetchError);
			setRows([]);
			setError(
				fetchError instanceof Error
					? fetchError.message
					: m.github_rank_error(),
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadRepos();
	}, []);

	const sortedRows = useMemo(
		() => [...rows].sort((a, b) => b.stars - a.stars),
		[rows],
	);

	return (
		<div className="container mx-auto max-w-6xl space-y-8 px-4 py-20">
			<div className="space-y-3 text-center">
				<h1 className="font-black text-4xl text-primary uppercase tracking-tighter md:text-6xl">
					{m.github_rank_title()}
				</h1>
				<p className="mx-auto max-w-3xl text-muted-foreground text-lg">
					{m.github_rank_subtitle()}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{m.github_rank_fetch()}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 md:flex-row md:items-center">
					<Select value="stars" disabled>
						<SelectTrigger className="w-full md:w-[240px]">
							<SelectValue placeholder={m.github_rank_sort_by()} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="stars">{m.github_rank_stars()}</SelectItem>
						</SelectContent>
					</Select>
					<Button
						type="button"
						disabled={loading}
						onClick={() => void loadRepos()}
					>
						{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
						{m.github_rank_fetch()}
					</Button>
				</CardContent>
			</Card>

			{loading && (
				<div className="flex items-center gap-2 text-muted-foreground">
					<Loader2 className="h-5 w-5 animate-spin" />
					<span>{m.github_rank_loading()}</span>
				</div>
			)}

			{error ? (
				<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
					{error}
				</div>
			) : null}

			{!loading && !error && sortedRows.length === 0 ? (
				<div className="rounded-lg border px-4 py-6 text-center text-muted-foreground">
					{m.github_rank_empty()}
				</div>
			) : null}

			{!loading && !error && sortedRows.length > 0 ? (
				<div className="rounded-xl border bg-card text-card-foreground shadow-sm">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[60px] text-center">#</TableHead>
								<TableHead>{m.github_rank_repo()}</TableHead>
								<TableHead className="hidden md:table-cell">
									{m.github_rank_language()}
								</TableHead>
								<TableHead className="text-right">
									{m.github_rank_stars()}
								</TableHead>
								<TableHead className="text-right hidden sm:table-cell">
									{m.github_rank_forks()}
								</TableHead>
								<TableHead className="text-right hidden lg:table-cell">
									{m.github_rank_open_issues()}
								</TableHead>
								<TableHead className="text-right whitespace-nowrap">
									{m.github_rank_updated()}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sortedRows.map((repo, index) => (
								<TableRow key={repo.htmlUrl}>
									<TableCell className="text-center font-mono font-medium text-muted-foreground">
										{index + 1}
									</TableCell>
									<TableCell>
										<div className="flex items-start gap-3">
											<Avatar className="mt-1">
												<AvatarImage src={repo.avatarUrl} alt={repo.fullName} />
												<AvatarFallback>
													{repo.name.slice(0, 2).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col gap-1 min-w-0">
												<a
													href={repo.htmlUrl}
													target="_blank"
													rel="noreferrer"
													className="inline-flex items-center gap-1 font-bold text-primary hover:underline transition-all truncate"
												>
													{repo.fullName}
													<ExternalLink className="h-3 w-3 shrink-0" />
												</a>
												{repo.description && (
													<p className="text-xs text-muted-foreground line-clamp-2 max-w-[300px] leading-relaxed">
														{repo.description}
													</p>
												)}
												{repo.topics && repo.topics.length > 0 && (
													<div className="mt-1 flex flex-wrap gap-1">
														{repo.topics.slice(0, 4).map((topic) => (
															<Badge
																key={topic}
																variant="secondary"
																className="h-4 px-1 text-[10px] font-normal"
															>
																{topic}
															</Badge>
														))}
														{repo.topics.length > 4 && (
															<span className="text-[10px] text-muted-foreground self-center">
																+{repo.topics.length - 4}
															</span>
														)}
													</div>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										{repo.language ? (
											<Badge variant="outline" className="font-normal">
												<Code2 className="mr-1 h-3 w-3" />
												{repo.language}
											</Badge>
										) : (
											"-"
										)}
									</TableCell>
									<TableCell className="text-right font-medium">
										<div className="flex items-center justify-end gap-1">
											<Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
											{repo.stars.toLocaleString()}
										</div>
									</TableCell>
									<TableCell className="text-right text-muted-foreground hidden sm:table-cell">
										<div className="flex items-center justify-end gap-1">
											<GitFork className="h-3.5 w-3.5" />
											{repo.forks.toLocaleString()}
										</div>
									</TableCell>
									<TableCell className="text-right text-muted-foreground hidden lg:table-cell">
										<div className="flex items-center justify-end gap-1">
											<CircleDot className="h-3.5 w-3.5" />
											{repo.openIssues.toLocaleString()}
										</div>
									</TableCell>
									<TableCell className="text-right text-muted-foreground text-xs whitespace-nowrap">
										{new Date(repo.updatedAt).toLocaleDateString()}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}
		</div>
	);
}
