// Shared between the file-manager API (server) and UI (client).

export type FileEntry = {
  name: string;
  path: string; // relative to the file-manager root, always starts with "/"
  type: "dir" | "file" | "symlink";
  size: number;
  mode: string; // e.g. "0644"
  permissions: string; // e.g. "-rw-r--r--"
  owner: string;
  modified: string; // ISO date
};

export type DirectoryListing = {
  root: string;
  path: string;
  entries: FileEntry[];
};
