import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
						{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
				<div className="overflow-x-auto rounded-xl border">
					<table className="min-w-full text-left text-sm">
						<thead className="bg-muted/60 text-muted-foreground">
							<tr>
								<th className="px-4 py-3">#</th>
								<th className="px-4 py-3">{m.github_rank_repo()}</th>
								<th className="px-4 py-3 text-right">
									{m.github_rank_stars()}
								</th>
								<th className="px-4 py-3 text-right">
									{m.github_rank_updated()}
								</th>
							</tr>
						</thead>
						<tbody>
							{sortedRows.map((repo, index) => (
								<tr key={repo.htmlUrl} className="border-t">
									<td className="px-4 py-3 font-semibold">{index + 1}</td>
									<td className="px-4 py-3">
										<a
											href={repo.htmlUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
										>
											{repo.fullName}
											<ExternalLink className="h-3.5 w-3.5" />
										</a>
									</td>
									<td className="px-4 py-3 text-right">{repo.stars}</td>
									<td className="px-4 py-3 text-right text-muted-foreground">
										{new Date(repo.updatedAt).toLocaleDateString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}
