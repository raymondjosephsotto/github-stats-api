import { GitHubStatsResponse } from "./types";

const GITHUB_QUERY = `
  query($username: String!) {
    user(login: $username) {
      
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
        nodes {
          isFork
          stargazerCount
          languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }

      contributionsCollection {
        totalCommitContributions
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

// Lookup table — converts GitHub's level strings to our numeric 0–4 scale
const levelMap: Record<string, 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const fetchGitHubStats = async (token: string, username: string): Promise<GitHubStatsResponse> => {

  // Send a POST request to GitHub's GraphQL endpoint with our query and auth token
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `bearer ${token}`,
    },
    body: JSON.stringify({
      query: GITHUB_QUERY,
      variables: { username },
    }),
  });

  // Parse the JSON response — typed as any because the raw GitHub shape is deeply nested
  const data = await response.json() as any;

  //GitHub's GraphQL API returns errors inside the response body (not as HTTP error codes) — so response.ok can be true even when something went wrong.
  if (data.errors || !data.data?.user) {
    throw new Error(data.errors?.[0]?.message ?? "GitHub API returned no user data");
  }

  // Shortcut reference to avoid repeating data.data.user everywhere
  const user = data.data.user;

  // Total number of public repositories owned by the user
  const totalRepos: number = user.repositories.totalCount;

  // Sum stargazer counts across all repos to get a total star count
  const totalStars: number = user.repositories.nodes.reduce(
    (sum: number, repo: any) => sum + repo.stargazerCount, 0
  );

  // Total commits made this year from the contributions collection
  const commitsThisYear: number = user.contributionsCollection.totalCommitContributions;

  // Accumulate total bytes written per language across all repos
  // Key = language name, value = { color, running byte total }
  const langMap: Record<string, { color: string; size: number }> = {};

  // loops through each repo, excluding forks
  user.repositories.nodes
    .filter((repo: any) => !repo.isFork)
    .forEach((repo: any) => {
      // loops each language edge inside the looped repo
      repo.languages.edges.forEach((edge: any) => {
        const name: string = edge.node.name;
        const color: string = edge.node.color ?? "#ccc"; // fallback if GitHub returns null
        const size: number = edge.size;                  // bytes of code in this language

        if (langMap[name]) {
          // Language already seen — add to its running byte total
          langMap[name].size += size;
        } else {
          // First occurrence — initialize a new entry in the map
          langMap[name] = { color, size };
        }
      });
    });

  // Total bytes across all languages — used as the denominator for percentages
  const totalBytes: number = Object.values(langMap).reduce(
    (sum, lang) => sum + lang.size, 0
  );

  // Convert map to a sorted array of Language objects with calculated percentages
  // Rounded to one decimal place, sorted highest to lowest, capped at top 5
  const topLanguages = Object.entries(langMap)
    .map(([name, { color, size }]) => ({
      name,
      color,
      percentage: Math.round((size / totalBytes) * 1000) / 10,
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  // Shortcut to the raw calendar data
  const calendar = user.contributionsCollection.contributionCalendar;

  const contributions = {
    total: calendar.totalContributions,
    weeks: calendar.weeks.map((week: any) => ({
      days: week.contributionDays.map((day: any) => ({
        date: day.date,
        count: day.contributionCount,
        level: levelMap[day.contributionLevel] ?? 0,
      })),
    })),
  };

  return {
    totalRepos,
    totalStars,
    commitsThisYear,
    topLanguages,
    contributions,
  };

};

export { fetchGitHubStats };