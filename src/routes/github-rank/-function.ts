import { createServerFn } from "@tanstack/react-start";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_REPOS = 100;
const METRICS_CONCURRENCY = 4;

export type GithubRankSortKey = "stars" | "commitCount" | "contributorCount";

export interface GithubRepoMetrics {
	fullName: string;
	name: string;
	htmlUrl: string;
	stars: number;
	commitCount: number;
	contributorCount: number;
	updatedAt: string;
}

interface GithubRepo {
	full_name: string;
	name: string;
	html_url: string;
	stargazers_count: number;
	default_branch: string;
	updated_at: string;
}

interface GithubSearchResponse {
	items: GithubRepo[];
}

const parseLastPage = (linkHeader: string | null): number | null => {
	if (!linkHeader) {
		return null;
	}

	const lastMatch = linkHeader.match(
		/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/,
	);
	if (lastMatch) {
		return Number.parseInt(lastMatch[1], 10);
	}

	const nextMatch = linkHeader.match(
		/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/,
	);
	if (nextMatch) {
		return Number.parseInt(nextMatch[1], 10) - 1;
	}

	return null;
};

const buildGitHubHeaders = (): HeadersInit => ({
	Accept: "application/vnd.github+json",
	"User-Agent": "my-tanstack-app",
	"X-GitHub-Api-Version": "2022-11-28",
});

const readRateLimitError = async (response: Response): Promise<never> => {
	const remaining = response.headers.get("x-ratelimit-remaining");
	if (response.status === 403 && remaining === "0") {
		throw new Error("GitHub API rate limit exceeded. Please retry later.");
	}

	let message = `GitHub API error: ${response.status}`;
	try {
		const payload = (await response.json()) as { message?: string };
		if (payload?.message) {
			message = payload.message;
		}
	} catch {
		// Keep fallback message when response body is not JSON.
	}

	throw new Error(message);
};

const fetchJson = async <T>(url: string): Promise<T> => {
	const response = await fetch(url, {
		headers: buildGitHubHeaders(),
	});

	if (!response.ok) {
		await readRateLimitError(response);
	}

	return (await response.json()) as T;
};

const fetchPaginatedCount = async (url: string): Promise<number> => {
	const response = await fetch(url, {
		headers: buildGitHubHeaders(),
	});

	if (response.status === 409 || response.status === 404) {
		return 0;
	}

	if (!response.ok) {
		await readRateLimitError(response);
	}

	const lastPage = parseLastPage(response.headers.get("link"));
	if (lastPage != null) {
		return Math.max(lastPage, 0);
	}

	const payload = (await response.json()) as unknown;
	if (Array.isArray(payload)) {
		return payload.length;
	}

	return 0;
};

const mapWithConcurrency = async <T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> => {
	const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
	const results = new Array<R>(items.length);
	let cursor = 0;

	await Promise.all(
		Array.from({ length: safeConcurrency }, async () => {
			for (;;) {
				const index = cursor;
				cursor += 1;
				if (index >= items.length) {
					return;
				}
				results[index] = await mapper(items[index]);
			}
		}),
	);

	return results;
};

export const fetchGithubRepoMetrics = createServerFn({
	method: "POST",
}).handler(async () => {
	const searchResult = await fetchJson<GithubSearchResponse>(
		`${GITHUB_API_BASE}/search/repositories?q=stars:%3E1&sort=stars&order=desc&per_page=${MAX_REPOS}&page=1`,
	);
	const repos = searchResult.items;

	const metricRows = await mapWithConcurrency(
		repos,
		METRICS_CONCURRENCY,
		async (repo): Promise<GithubRepoMetrics> => {
			const repoPath = repo.full_name
				.split("/")
				.map((segment) => encodeURIComponent(segment))
				.join("/");
			const commitCount = await fetchPaginatedCount(
				`${GITHUB_API_BASE}/repos/${repoPath}/commits?per_page=1&sha=${encodeURIComponent(repo.default_branch)}`,
			);
			const contributorCount = await fetchPaginatedCount(
				`${GITHUB_API_BASE}/repos/${repoPath}/contributors?per_page=1&anon=1`,
			);

			return {
				fullName: repo.full_name,
				name: repo.name,
				htmlUrl: repo.html_url,
				stars: repo.stargazers_count,
				commitCount,
				contributorCount,
				updatedAt: repo.updated_at,
			};
		},
	);

	return metricRows;
});
