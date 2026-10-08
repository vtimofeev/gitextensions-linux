import { readJSON } from "./preferences";

export interface RecentRepo {
  path: string;
  lastOpened: string;
  favorite: boolean;
}
export function sortRecentRepos(repos: RecentRepo[]): RecentRepo[] {
  return [...repos].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      Date.parse(b.lastOpened) - Date.parse(a.lastOpened),
  );
}
export function loadRecentRepos(): RecentRepo[] {
  const key = "gitextensions.recentRepos";
  if (localStorage.getItem(key) !== null) {
    const saved = readJSON<unknown>(key, []);
    const seen = new Set<string>();
    return sortRecentRepos(
      Array.isArray(saved)
        ? saved.filter((repo): repo is RecentRepo => {
            if (
              !repo ||
              typeof repo.path !== "string" ||
              !repo.path ||
              typeof repo.lastOpened !== "string" ||
              !Number.isFinite(Date.parse(repo.lastOpened)) ||
              typeof repo.favorite !== "boolean" ||
              seen.has(repo.path)
            )
              return false;
            seen.add(repo.path);
            return true;
          })
        : [],
    );
  }
  const legacy = readJSON<unknown>("gitextensions.recent", []);
  const now = Date.now();
  const paths = Array.isArray(legacy)
    ? [
        ...new Set(
          legacy.filter(
            (path): path is string => typeof path === "string" && !!path,
          ),
        ),
      ]
    : [];
  const repos = paths.map((path, index) => ({
    path,
    lastOpened: new Date(now - index * 1000).toISOString(),
    favorite: false,
  }));
  localStorage.setItem(key, JSON.stringify(repos));
  return repos;
}
