// A single programming language with its GitHub-assigned color and usage share
export interface Language {
  name: string; // e.g. "TypeScript"
  color: string; // hex color GitHub assigns per language, e.g. "#3178c6"
  percentage: number; // share of total code, e.g. 72.4
}

// A single day cell in the contribution heatmap
export interface ContributionDay {
  date: string; // ISO date string, e.g. "2026-03-13"
  count: number; // number of contributions on that day
  level: 0 | 1 | 2 | 3 | 4; // activity intensity — 0 = none, 4 = highest
}

// A calendar week is an ordered array of up to 7 days
export interface ContributionWeek {
  days: ContributionDay[];
}

// The complete response shape returned by GET /api/github
export interface GitHubStatsResponse {
  profile: {
    avatarUrl: string;
    displayName: string;
    username: string;
  };
  repositories: {
    contributedTo: number;
    total: number;
  };
  totalCommits: number;
  totalPullRequests: number;
  totalStars: number;
  topLanguages: Language[];
  contributions: {
    total: number; // total contributions in the queried period
    from: string; // start of current UTC year
    to: string; // latest data point included in the heatmap
    weeks: ContributionWeek[]; // daily heatmap data for the current year
  };
}
