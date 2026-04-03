import { createServerFn } from "@tanstack/react-start";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_REPOS = 100;
const GITHUB_TOKEN =
	typeof process !== "undefined" ? process.env.GITHUB_TOKEN : undefined;

export type GithubRankSortKey = "stars";

export interface GithubRepoMetrics {
	fullName: string;
	name: string;
	htmlUrl: string;
	stars: number;
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

const buildGitHubHeaders = (): HeadersInit => {
	const headers: HeadersInit = {
		Accept: "application/vnd.github+json",
		"User-Agent": "my-tanstack-app",
		"X-GitHub-Api-Version": "2022-11-28",
	};

	if (GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
	}

	return headers;
};

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

export const fetchGithubRepoMetrics = createServerFn({
	method: "POST",
}).handler(async () => {
	const searchResult = await fetchJson<GithubSearchResponse>(
		`${GITHUB_API_BASE}/search/repositories?q=stars:%3E1&sort=stars&order=desc&per_page=${MAX_REPOS}&page=1`,
	);

	return searchResult.items
		.sort((a, b) => b.stargazers_count - a.stargazers_count)
		.slice(0, MAX_REPOS)
		.map(
			(repo): GithubRepoMetrics => ({
				fullName: repo.full_name,
				name: repo.name,
				htmlUrl: repo.html_url,
				stars: repo.stargazers_count,
				updatedAt: repo.updated_at,
			}),
		);
});
