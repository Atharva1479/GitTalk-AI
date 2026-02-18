interface ExampleRepo {
  name: string
  url: string
}

const EXAMPLE_REPOS: ExampleRepo[] = [
  { name: "TalkToGithub", url: "https://github.com/Atharva1479/GTA" },
  { name: "GitIngest", url: "https://github.com/cyclotruc/gitingest" },
  { name: "Apple-MCP", url: "https://github.com/Dhravya/apple-mcp" },
  { name: "Bruno", url: "https://github.com/usebruno/bruno" },
  { name: "easyEdits", url: "https://github.com/robinroy03/easyEdits" },
]

interface ExampleReposProps {
  onSelect: (url: string) => void
}

export function ExampleRepos({ onSelect }: ExampleReposProps) {
  return (
    <div className="flex flex-wrap gap-2 max-w-full">
      {EXAMPLE_REPOS.map((repo) => (
        <button
          key={repo.url}
          onClick={() => onSelect(repo.url)}
          className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-main/15 text-main border border-main/10 hover:bg-main/25 hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer"
        >
          {repo.name}
        </button>
      ))}
    </div>
  )
}
