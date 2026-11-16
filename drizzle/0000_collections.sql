CREATE TABLE collections (
  code TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE submissions (
  code TEXT NOT NULL REFERENCES collections(code) ON DELETE CASCADE,
  author TEXT NOT NULL,
  name TEXT NOT NULL,
  answers TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (code, author)
);
