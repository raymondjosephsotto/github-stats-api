import { GitHubStatsResponse } from "./types";

const PROFILE_QUERY = `
  query(
    $username: String!
    $heatmapFrom: DateTime!
    $heatmapTo: DateTime!
  ) {
    user(login: $username) {
      login
      name
      createdAt
      avatarUrl(size: 200)
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
        totalCount
      }
      repositoriesContributedTo(
        first: 1
        privacy: PUBLIC
        contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]
      ) {
        totalCount
      }
      yearlyContributions: contributionsCollection(
        from: $heatmapFrom
        to: $heatmapTo
      ) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

const REPOSITORIES_QUERY = `
  query($username: String!, $cursor: String) {
    user(login: $username) {
      repositories(
        first: 100
        after: $cursor
        ownerAffiliations: OWNER
        privacy: PUBLIC
        isFork: false
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          isArchived
          isEmpty
          stargazerCount
          primaryLanguage {
            name
            color
          }
        }
      }
    }
  }
`;

type GitHubGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ProfileQueryData = {
  user: {
    login: string;
    name: string | null;
    createdAt: string;
    avatarUrl: string;
    repositories: {
      totalCount: number;
    };
    repositoriesContributedTo: {
      totalCount: number;
    };
    yearlyContributions: {
      contributionCalendar: {
        totalContributions: number;
        weeks: Array<{
          contributionDays: Array<{
            date: string;
            contributionCount: number;
            contributionLevel: string;
          }>;
        }>;
      };
    };
  } | null;
};

type ContributionsWindowQueryData = {
  user: {
    contributions: {
      totalCommitContributions: number;
      totalPullRequestContributions: number;
    };
  } | null;
};

type RepositoriesQueryData = {
  user: {
    repositories: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: Array<{
        isArchived: boolean;
        isEmpty: boolean;
        stargazerCount: number;
        primaryLanguage: {
          name: string;
          color: string | null;
        } | null;
      }>;
    };
  } | null;
};

type RepositoryNode = NonNullable<
  RepositoriesQueryData["user"]
>["repositories"]["nodes"][number];

type RepositoryConnection = NonNullable<
  RepositoriesQueryData["user"]
>["repositories"];

// Converts GitHub's contribution levels to a numeric 0-4 scale.
const levelMap: Record<string, 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const CONTRIBUTIONS_WINDOW_QUERY = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributions: contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
      }
    }
  }
`;

async function runGitHubQuery<T>(
  token: string,
  query: string,
  variables: Record<string, string | null>,
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = (await response.json()) as GitHubGraphQLResponse<T>;

  if (result.errors?.length) {
    throw new Error(result.errors[0]?.message ?? "GitHub API request failed");
  }

  if (!result.data) {
    throw new Error("GitHub API returned no data");
  }

  return result.data;
}

function addYearsUtc(date: Date, years: number): Date {
  const newDate = new Date(date);
  newDate.setUTCFullYear(date.getUTCFullYear() + years);
  return newDate;
}

async function fetchLifetimeContributionTotals(
  token: string,
  username: string,
  createdAtIso: string,
  now: Date,
): Promise<{ totalCommits: number; totalPullRequests: number }> {
  let windowStart = new Date(createdAtIso);
  let totalCommits = 0;
  let totalPullRequests = 0;

  while (windowStart <= now) {
    const nextWindowStart = addYearsUtc(windowStart, 1);
    const windowEnd = new Date(
      Math.min(now.getTime(), nextWindowStart.getTime() - 1),
    );

    const contributionData = await runGitHubQuery<ContributionsWindowQueryData>(
      token,
      CONTRIBUTIONS_WINDOW_QUERY,
      {
        username,
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
    );

    if (!contributionData.user) {
      throw new Error("GitHub API returned no contribution data");
    }

    totalCommits += contributionData.user.contributions.totalCommitContributions;
    totalPullRequests += contributionData.user.contributions.totalPullRequestContributions;

    windowStart = nextWindowStart;
  }

  return { totalCommits, totalPullRequests };
}

const fetchGitHubStats = async (
  token: string,
  username: string,
): Promise<GitHubStatsResponse> => {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  // Compute once and reuse in both the query and the response shape
  const heatmapFrom = startOfYear.toISOString();
  const heatmapTo = now.toISOString();

  const profileData = await runGitHubQuery<ProfileQueryData>(token, PROFILE_QUERY, {
    username,
    heatmapFrom,
    heatmapTo,
  });

  if (!profileData.user) {
    throw new Error("GitHub API returned no user data");
  }

  const user = profileData.user;
  const lifetimeTotals = await fetchLifetimeContributionTotals(
    token,
    username,
    user.createdAt,
    now,
  );
  const langMap: Record<string, { color: string; repoCount: number }> = {};
  let totalStars = 0;
  let cursor: string | null = null;
  let hasNextPage = true;
  let totalRankedRepos = 0;

  while (hasNextPage) {
    const repositoryData: RepositoriesQueryData = await runGitHubQuery<RepositoriesQueryData>(
      token,
      REPOSITORIES_QUERY,
      { username, cursor },
    );

    if (!repositoryData.user) {
      throw new Error("GitHub API returned no repository data");
    }

    const repositories: RepositoryConnection = repositoryData.user.repositories;

    repositories.nodes.forEach((repo: RepositoryNode) => {
      totalStars += repo.stargazerCount;

      // Empty or archived repos can skew language rankings with stale/generated code.
      if (repo.isArchived || repo.isEmpty) {
        return;
      }

      if (!repo.primaryLanguage) {
        return;
      }

      totalRankedRepos += 1;

      const color = repo.primaryLanguage.color ?? "#cccccc";
      langMap[repo.primaryLanguage.name] = {
        color,
        repoCount: (langMap[repo.primaryLanguage.name]?.repoCount ?? 0) + 1,
      };
    });

    hasNextPage = repositories.pageInfo.hasNextPage;
    cursor = repositories.pageInfo.endCursor;
  }

  const topLanguages = Object.entries(langMap)
    .map(([name, { color, repoCount }]) => ({
      name,
      color,
      percentage:
        totalRankedRepos === 0
          ? 0
          : Math.round((repoCount / totalRankedRepos) * 1000) / 10,
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  const calendar = user.yearlyContributions.contributionCalendar;
  const heatmapDays = calendar.weeks.map((week) => ({
    days: week.contributionDays
      .filter((day) => day.date >= heatmapFrom.slice(0, 10) && day.date <= heatmapTo.slice(0, 10))
      .map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: levelMap[day.contributionLevel] ?? 0,
      })),
  })).filter((week) => week.days.length > 0);

  return {
    profile: {
      avatarUrl: user.avatarUrl,
      displayName: user.name ?? user.login,
      username: user.login,
    },
    repositories: {
      contributedTo: user.repositoriesContributedTo.totalCount,
      total: user.repositories.totalCount,
    },
    totalCommits: lifetimeTotals.totalCommits,
    totalPullRequests: lifetimeTotals.totalPullRequests,
    totalStars,
    topLanguages,
    contributions: {
      total: calendar.totalContributions,
      from: heatmapFrom,
      to: heatmapTo,
      weeks: heatmapDays,
    },
  };
};

export { fetchGitHubStats };
