export namespace gitclient {
	
	export class BlameLine {
	    originalPath: string;
	    hash: string;
	    author: string;
	    email: string;
	    date: string;
	    summary: string;
	    originalLine: number;
	    line: number;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new BlameLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.originalPath = source["originalPath"];
	        this.hash = source["hash"];
	        this.author = source["author"];
	        this.email = source["email"];
	        this.date = source["date"];
	        this.summary = source["summary"];
	        this.originalLine = source["originalLine"];
	        this.line = source["line"];
	        this.text = source["text"];
	    }
	}
	export class BlameOptions {
	    ignoreWhitespace: boolean;
	    detectCopiesInFile: boolean;
	    detectCopiesInAllFiles: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BlameOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ignoreWhitespace = source["ignoreWhitespace"];
	        this.detectCopiesInFile = source["detectCopiesInFile"];
	        this.detectCopiesInAllFiles = source["detectCopiesInAllFiles"];
	    }
	}
	export class Branch {
	    ahead: number;
	    behind: number;
	    date: string;
	    name: string;
	    hash: string;
	    current: boolean;
	    remote: boolean;
	    upstream: string;
	    tracking: string;
	
	    static createFrom(source: any = {}) {
	        return new Branch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.date = source["date"];
	        this.name = source["name"];
	        this.hash = source["hash"];
	        this.current = source["current"];
	        this.remote = source["remote"];
	        this.upstream = source["upstream"];
	        this.tracking = source["tracking"];
	    }
	}
	export class Commit {
	    hash: string;
	    parents: string[];
	    authorEmail: string;
	    author: string;
	    date: string;
	    subject: string;
	    refs: string;
	
	    static createFrom(source: any = {}) {
	        return new Commit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.parents = source["parents"];
	        this.authorEmail = source["authorEmail"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.subject = source["subject"];
	        this.refs = source["refs"];
	    }
	}
	export class CommitDetails {
	    hash: string;
	    parents: string[];
	    authorEmail: string;
	    author: string;
	    date: string;
	    subject: string;
	    refs: string;
	    committer: string;
	    committerEmail: string;
	    committerDate: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.parents = source["parents"];
	        this.authorEmail = source["authorEmail"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.subject = source["subject"];
	        this.refs = source["refs"];
	        this.committer = source["committer"];
	        this.committerEmail = source["committerEmail"];
	        this.committerDate = source["committerDate"];
	        this.message = source["message"];
	    }
	}
	export class ConflictData {
	    path: string;
	    token: string;
	    binary: boolean;
	    oursPresent: boolean;
	    theirsPresent: boolean;
	    externalSupported: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConflictData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.token = source["token"];
	        this.binary = source["binary"];
	        this.oursPresent = source["oursPresent"];
	        this.theirsPresent = source["theirsPresent"];
	        this.externalSupported = source["externalSupported"];
	    }
	}
	export class FileContent {
	    text: string;
	    binary: boolean;
	    imageMime?: string;
	    imageBase64?: string;
	
	    static createFrom(source: any = {}) {
	        return new FileContent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.binary = source["binary"];
	        this.imageMime = source["imageMime"];
	        this.imageBase64 = source["imageBase64"];
	    }
	}
	export class FileRevision {
	    commit: Commit;
	    file: string;
	    originalPath: string;
	
	    static createFrom(source: any = {}) {
	        return new FileRevision(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.commit = this.convertValues(source["commit"], Commit);
	        this.file = source["file"];
	        this.originalPath = source["originalPath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileStatus {
	    path: string;
	    originalPath: string;
	    index: string;
	    worktree: string;
	    untracked: boolean;
	    conflict: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.originalPath = source["originalPath"];
	        this.index = source["index"];
	        this.worktree = source["worktree"];
	        this.untracked = source["untracked"];
	        this.conflict = source["conflict"];
	    }
	}
	export class Identity {
	    name: string;
	    email: string;
	    scope: string;
	    localName: boolean;
	    localEmail: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Identity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.email = source["email"];
	        this.scope = source["scope"];
	        this.localName = source["localName"];
	        this.localEmail = source["localEmail"];
	    }
	}
	export class MergeTool {
	    name: string;
	    path: string;
	    available: boolean;
	    configured: boolean;
	    default: boolean;
	    custom: boolean;
	    trustExit: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MergeTool(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.available = source["available"];
	        this.configured = source["configured"];
	        this.default = source["default"];
	        this.custom = source["custom"];
	        this.trustExit = source["trustExit"];
	    }
	}
	export class PushOptions {
	    remote: string;
	    branch: string;
	    setUpstream: boolean;
	    forceWithLease: boolean;
	    tags: boolean;
	    dryRun: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PushOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.remote = source["remote"];
	        this.branch = source["branch"];
	        this.setUpstream = source["setUpstream"];
	        this.forceWithLease = source["forceWithLease"];
	        this.tags = source["tags"];
	        this.dryRun = source["dryRun"];
	    }
	}
	export class RefOptions {
	    action: string;
	    target: string;
	    name: string;
	    mode: string;
	    message: string;
	    remote: boolean;
	    detach: boolean;
	    noCommit: boolean;
	    squash: boolean;
	    recordOrigin: boolean;
	    mainline: number;
	    rebaseMerges: boolean;
	    force: boolean;
	    checkout: boolean;
	    tagType: string;
	    push: boolean;
	    remoteName: string;
	
	    static createFrom(source: any = {}) {
	        return new RefOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.target = source["target"];
	        this.name = source["name"];
	        this.mode = source["mode"];
	        this.message = source["message"];
	        this.remote = source["remote"];
	        this.detach = source["detach"];
	        this.noCommit = source["noCommit"];
	        this.squash = source["squash"];
	        this.recordOrigin = source["recordOrigin"];
	        this.mainline = source["mainline"];
	        this.rebaseMerges = source["rebaseMerges"];
	        this.force = source["force"];
	        this.checkout = source["checkout"];
	        this.tagType = source["tagType"];
	        this.push = source["push"];
	        this.remoteName = source["remoteName"];
	    }
	}
	export class ReviewOptions {
	    tool: string;
	    executable: string;
	    template: string;
	    terminal: string;
	    commit: string;
	    instructions: string;
	    details: string;
	    prompt: string;
	
	    static createFrom(source: any = {}) {
	        return new ReviewOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tool = source["tool"];
	        this.executable = source["executable"];
	        this.template = source["template"];
	        this.terminal = source["terminal"];
	        this.commit = source["commit"];
	        this.instructions = source["instructions"];
	        this.details = source["details"];
	        this.prompt = source["prompt"];
	    }
	}
	export class Snapshot {
	    homePath: string;
	    ahead: number;
	    behind: number;
	    hasUpstream: boolean;
	    dirtyCount: number;
	    path: string;
	    branch: string;
	    detached: boolean;
	    operation: string;
	    commits: Commit[];
	    branches: Branch[];
	    files: FileStatus[];
	    remotes: string[];
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.homePath = source["homePath"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.hasUpstream = source["hasUpstream"];
	        this.dirtyCount = source["dirtyCount"];
	        this.path = source["path"];
	        this.branch = source["branch"];
	        this.detached = source["detached"];
	        this.operation = source["operation"];
	        this.commits = this.convertValues(source["commits"], Commit);
	        this.branches = this.convertValues(source["branches"], Branch);
	        this.files = this.convertValues(source["files"], FileStatus);
	        this.remotes = source["remotes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StashEntry {
	    hash: string;
	    selector: string;
	    date: string;
	    subject: string;
	
	    static createFrom(source: any = {}) {
	        return new StashEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.selector = source["selector"];
	        this.date = source["date"];
	        this.subject = source["subject"];
	    }
	}
	export class WorkingState {
	    dirtyCount: number;
	    files: FileStatus[];
	    operation: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkingState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dirtyCount = source["dirtyCount"];
	        this.files = this.convertValues(source["files"], FileStatus);
	        this.operation = source["operation"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

