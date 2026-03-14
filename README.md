# github-stats-api

## Overview
github-stats-api is a serverless API that exposes GitHub profile statistics as a clean JSON endpoint. It is designed to be used as a backend for the [github-stats-widget](https://github.com/raymondjosephsotto/github-stats-widget) frontend, enabling seamless integration of GitHub stats into web applications.

## Tech Specs
- **TypeScript** for type safety and maintainability
- **Serverless** deployment via [Vercel](https://vercel.com/)
- **GitHub GraphQL API** for fetching profile, repository, and contribution data
- **CORS** enabled for easy frontend integration
- **API Endpoint:** `/api/github` (see [vercel.json](vercel.json))
- **Environment Variables:**
	- `GITHUB_TOKEN`: GitHub personal access token (with `read:user` and `repo` scopes)
	- `GITHUB_USERNAME`: GitHub username to fetch stats for

## Usage Instructions

### 1. Clone and Setup
Clone this repo and install dependencies:

```bash
git clone https://github.com/raymondjosephsotto/github-stats-api.git
cd github-stats-api
npm install
```

### 2. Configure Environment Variables
Create a `.env` file or set environment variables in Vercel:

```
GITHUB_TOKEN=your_github_token
GITHUB_USERNAME=your_github_username
```

### 3. Deploy
Deploy to Vercel:

```bash
npm run deploy
```

### 4. API Usage
The API exposes a single endpoint:

- `GET /api/github` — Returns JSON with profile, repository, language, and contribution stats.

Example response:
```json
{
	"profile": {
		"avatarUrl": "...",
		"displayName": "...",
		"username": "..."
	},
	"repositories": {
		"contributedTo": 12,
		"total": 34
	},
	"totalCommits": 1234,
	"totalPullRequests": 56,
	"totalStars": 78,
	"topLanguages": [
		{ "name": "TypeScript", "color": "#3178c6", "percentage": 72.4 }
	],
	"contributions": {
		"total": 365,
		"from": "2026-01-01T00:00:00Z",
		"to": "2026-03-14T00:00:00Z",
		"weeks": [ ... ]
	}
}
```

### 5. Integrate with github-stats-widget
Use the [github-stats-widget](https://github.com/raymondjosephsotto/github-stats-widget) frontend to display stats. Configure the widget to point to your deployed API endpoint (e.g., `https://your-vercel-app/api/github`).

## Development
- Build: `npm run build`
- Deploy: `npm run deploy`
- Type checking: `tsc`

## License
MIT
