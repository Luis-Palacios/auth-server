CREATE TABLE "person" (
	"id" serial PRIMARY KEY,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL UNIQUE
);
