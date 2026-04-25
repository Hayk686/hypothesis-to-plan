import { Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hero shadow-glow transition-smooth group-hover:scale-105">
            <FlaskConical className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-base font-semibold tracking-tight">
              Hypothesis<span className="text-primary">→</span>Plan
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Research Co-Scientist
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/projects"
            className="rounded-md px-3 py-2 text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-md px-3 py-2 bg-muted text-foreground" }}
          >
            Projects
          </Link>
          <Link
            to="/new"
            className="ml-2 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-smooth hover:bg-primary/90 hover:shadow-glow"
          >
            New Project
          </Link>
        </nav>
      </div>
    </header>
  );
}
