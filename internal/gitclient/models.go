package gitclient

type Commit struct {
	Hash        string   `json:"hash"`
	Parents     []string `json:"parents"`
	AuthorEmail string   `json:"authorEmail"`
	Author      string   `json:"author"`
	Date        string   `json:"date"`
	Subject     string   `json:"subject"`
	Refs        string   `json:"refs"`
}
type Branch struct {
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	Date     string `json:"date"`
	Name     string `json:"name"`
	Hash     string `json:"hash"`
	Current  bool   `json:"current"`
	Remote   bool   `json:"remote"`
	Upstream string `json:"upstream"`
	Tracking string `json:"tracking"`
}
type FileStatus struct {
	Path         string `json:"path"`
	OriginalPath string `json:"originalPath"`
	Index        string `json:"index"`
	Worktree     string `json:"worktree"`
	Untracked    bool   `json:"untracked"`
	Conflict     bool   `json:"conflict"`
}
type Snapshot struct {
	HomePath    string       `json:"homePath"`
	Ahead       int          `json:"ahead"`
	Behind      int          `json:"behind"`
	HasUpstream bool         `json:"hasUpstream"`
	DirtyCount  int          `json:"dirtyCount"`
	Path        string       `json:"path"`
	Branch      string       `json:"branch"`
	Detached    bool         `json:"detached"`
	Operation   string       `json:"operation"`
	Commits     []Commit     `json:"commits"`
	Branches    []Branch     `json:"branches"`
	Files       []FileStatus `json:"files"`
	Remotes     []string     `json:"remotes"`
}
type WorkingState struct {
	DirtyCount int          `json:"dirtyCount"`
	Files      []FileStatus `json:"files"`
	Operation  string       `json:"operation"`
}

type PushOptions struct {
	Remote         string `json:"remote"`
	Branch         string `json:"branch"`
	SetUpstream    bool   `json:"setUpstream"`
	ForceWithLease bool   `json:"forceWithLease"`
	Tags           bool   `json:"tags"`
	DryRun         bool   `json:"dryRun"`
}

type Identity struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Scope string `json:"scope"`
	// Local flags prevent path rules from overwriting even a partial local identity.
	LocalName  bool `json:"localName"`
	LocalEmail bool `json:"localEmail"`
}
