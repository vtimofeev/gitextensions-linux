import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "../src/store/preferences";
import { Repository } from "../src/store/repository";
import { GitApi } from "../src/api/git-api";
import type { Identity, Snapshot } from "../src/domain/models";

function fixture() {
  const preferences = new Preferences();
  preferences.profiles = [
    {
      id: "home",
      label: "Home",
      name: "Person",
      email: "same@test",
      color: "#123456",
    },
    {
      id: "work",
      label: "Work",
      name: "Person",
      email: "same@test",
      color: "#654321",
    },
  ];
  let identity: Identity = {
    name: "Person",
    email: "same@test",
    scope: "local",
    localName: true,
    localEmail: true,
  };
  const api = new GitApi();
  api.snapshot = vi.fn(
    async (path: string) =>
      ({
        path,
        commits: [],
        branches: [],
        files: [],
        remotes: [],
      }) as unknown as Snapshot,
  );
  api.identity = vi.fn(async () => ({ ...identity }));
  api.setIdentity = vi.fn(async (_path, name, email) => {
    identity = {
      name,
      email,
      scope: "local",
      localName: true,
      localEmail: true,
    };
    return "";
  });
  const repo = new Repository(api, preferences);
  repo.translate = (key, params) => `${key}: ${params?.label}`;
  return {
    preferences,
    api,
    repo,
    setIdentity: (value: Identity) => {
      identity = value;
    },
  };
}

describe("remembered repository profiles", () => {
  beforeEach(() => localStorage.clear());
  it("prefers the selected id over identical identity matches and persists despite deferred saving", async () => {
    const { repo, preferences } = fixture();
    await repo.open("/repo");
    expect(repo.activeProfile?.id).toBe("home");
    preferences.deferSave = true;
    const initial = preferences.capture();
    await repo.applyProfile(preferences.profiles[1]!);
    expect(repo.activeProfile?.id).toBe("work");
    expect(
      JSON.parse(localStorage.getItem("gitextensions.identity.repoProfiles")!),
    ).toEqual({ "/repo": "work" });
    preferences.restore(initial);
    expect(preferences.repoProfiles["/repo"]).toBe("work");
    expect(new Preferences().repoProfiles["/repo"]).toBe("work");
    await repo.applyProfile({ name: "Custom", email: "custom@test" });
    expect(preferences.repoProfiles).toEqual({});
  });
  it("reapplies differing remembered identities, skips equal local values and restores cleared local config", async () => {
    const { repo, preferences, api, setIdentity } = fixture();
    preferences.rememberProfile("/repo", "work");
    await repo.open("/repo");
    expect(api.setIdentity).not.toHaveBeenCalled();
    expect(repo.notice).toBe("");
    setIdentity({ name: "Other", email: "other@test", scope: "local" });
    await repo.open("/repo");
    expect(api.setIdentity).toHaveBeenCalledWith(
      "/repo",
      "Person",
      "same@test",
    );
    expect(repo.notice).toBe("rememberedProfileApplied: Work");
    vi.mocked(api.setIdentity).mockClear();
    setIdentity({
      name: "Person",
      email: "same@test",
      scope: "global",
      localName: false,
      localEmail: false,
    });
    await repo.open("/repo");
    expect(api.setIdentity).toHaveBeenCalledTimes(1);
  });
  it("drops deleted ids silently and remembers an eligible path rule", async () => {
    const { repo, preferences, api, setIdentity } = fixture();
    preferences.rememberProfile("/repo", "deleted");
    await repo.open("/repo");
    expect(preferences.repoProfiles).toEqual({});
    expect(repo.notice).toBe("");
    expect(api.setIdentity).not.toHaveBeenCalled();
    preferences.rememberProfile("/repo", "deleted");
    preferences.rules = [{ pattern: "/repo", profileId: "work" }];
    setIdentity({
      name: "",
      email: "",
      scope: "global",
      localName: false,
      localEmail: false,
    });
    await repo.open("/repo");
    expect(preferences.repoProfiles["/repo"]).toBe("work");
    expect(
      JSON.parse(localStorage.getItem("gitextensions.identity.repoProfiles")!),
    ).toEqual({ "/repo": "work" });
    expect(repo.notice).toBe("profileApplied: Work");
  });
  it("applies saved name/email edits to the current mapped repository only", async () => {
    const { repo, preferences, api } = fixture();
    preferences.rememberProfile("/repo", "work");
    preferences.rememberProfile("/other", "work");
    await repo.open("/repo");
    const previous = structuredClone(preferences.profiles);
    preferences.profiles[1]!.name = "Edited";
    preferences.profiles[1]!.email = "edited@test";
    preferences.save();
    await repo.profilesSaved(previous);
    expect(api.setIdentity).toHaveBeenCalledExactlyOnceWith(
      "/repo",
      "Edited",
      "edited@test",
    );
    expect(repo.identity?.name).toBe("Edited");
    await repo.open("/other");
    expect(repo.activeProfile?.id).toBe("work");
  });
  it("removes deleted profiles' mappings on save and persists Forget outside cancellation", () => {
    const { preferences } = fixture();
    preferences.rememberProfile("/repo", "work");
    preferences.rememberProfile("/other", "work");
    preferences.rememberProfile("/home", "home");
    preferences.profiles = preferences.profiles.filter((p) => p.id !== "work");
    preferences.save();
    expect(preferences.repoProfiles).toEqual({ "/home": "home" });
    const initial = preferences.capture();
    preferences.deferSave = true;
    preferences.rememberProfile("/home");
    preferences.restore(initial);
    expect(preferences.repoProfiles).toEqual({});
    expect(new Preferences().repoProfiles).toEqual({});
  });
  it("ignores malformed persisted mappings", () => {
    for (const value of ["[]", "42", '"bad"', "null"]) {
      localStorage.setItem("gitextensions.identity.repoProfiles", value);
      expect(new Preferences().repoProfiles).toEqual({});
    }
  });
});
