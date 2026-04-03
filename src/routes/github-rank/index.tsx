import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import * as m from "@/paraglide/messages";
import {
	fetchGithubRepoMetrics,
	type GithubRankSortKey,
	type GithubRepoMetrics,
} from "./-function";

export const Route = createFileRoute("/github-rank/")({
	component: GithubRankPage,
});

const DEFAULT_OWNER = "tanstack";

function GithubRankPage() {
	const [ownerInput, setOwnerInput] = useState(DEFAULT_OWNER);
	const [owner, setOwner] = useState(DEFAULT_OWNER);
	const [sortKey, setSortKey] = useState<GithubRankSortKey>("stars");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [rows, setRows] = useState<GithubRepoMetrics[]>([]);

	const loadRepos = async (nextOwner: string) => {
		const trimmedOwner = nextOwner.trim();
		if (!trimmedOwner) {
			setError(m.github_rank_error());
			setRows([]);
			return;
		}

		setLoading(true);
		setError("");

		try {
			const result = await fetchGithubRepoMetrics({
				data: { owner: trimmedOwner },
			});
			setRows(result);
			setOwner(trimmedOwner);
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
		void loadRepos(DEFAULT_OWNER);
	}, []);

	const sortedRows = useMemo(() => {
		const valueSelector: Record<
			GithubRankSortKey,
			(item: GithubRepoMetrics) => number
		> = {
			stars: (item) => item.stars,
			commitCount: (item) => item.commitCount,
			contributorCount: (item) => item.contributorCount,
		};

		return [...rows].sort((a, b) => {
			const diff = valueSelector[sortKey](b) - valueSelector[sortKey](a);
			if (diff !== 0) {
				return diff;
			}
			return b.stars - a.stars;
		});
	}, [rows, sortKey]);

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void loadRepos(ownerInput);
	};

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
				<CardContent>
					<form
						onSubmit={onSubmit}
						className="grid gap-4 md:grid-cols-[1fr_auto_auto]"
					>
						<Input
							value={ownerInput}
							onChange={(event) => setOwnerInput(event.target.value)}
							placeholder={m.github_rank_owner_placeholder()}
							aria-label={m.github_rank_owner()}
						/>
						<Select
							value={sortKey}
							onValueChange={(value) => setSortKey(value as GithubRankSortKey)}
						>
							<SelectTrigger className="w-full md:w-[200px]">
								<SelectValue placeholder={m.github_rank_sort_by()} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="stars">{m.github_rank_stars()}</SelectItem>
								<SelectItem value="commitCount">
									{m.github_rank_commits()}
								</SelectItem>
								<SelectItem value="contributorCount">
									{m.github_rank_contributors()}
								</SelectItem>
							</SelectContent>
						</Select>
						<Button type="submit" disabled={loading}>
							{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
							{m.github_rank_fetch()}
						</Button>
					</form>
				</CardContent>
			</Card>

			<div className="text-sm text-muted-foreground">
				{m.github_rank_owner()}: <span className="font-semibold">{owner}</span>
			</div>

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
									{m.github_rank_commits()}
								</th>
								<th className="px-4 py-3 text-right">
									{m.github_rank_contributors()}
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
											{repo.name}
											<ExternalLink className="h-3.5 w-3.5" />
										</a>
									</td>
									<td className="px-4 py-3 text-right">{repo.stars}</td>
									<td className="px-4 py-3 text-right">{repo.commitCount}</td>
									<td className="px-4 py-3 text-right">
										{repo.contributorCount}
									</td>
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
