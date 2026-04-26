import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hypothesis→Plan — AI Research Co-Scientist" },
      {
        name: "description",
        content:
          "Turn a raw scientific hypothesis into a complete experimental plan: novelty scoring, related work, protocols, budgets, timelines, validation, and risk analysis.",
      },
      { property: "og:title", content: "Hypothesis→Plan — AI Research Co-Scientist" },
      {
        property: "og:description",
        content: "Generate a full experimental plan from a single hypothesis in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      { name: "twitter:title", content: "Hypothesis→Plan — AI Research Co-Scientist" },
      { name: "description", content: "An AI research co-scientist that transforms scientific hypotheses into comprehensive experimental plans." },
      { property: "og:description", content: "An AI research co-scientist that transforms scientific hypotheses into comprehensive experimental plans." },
      { name: "twitter:description", content: "An AI research co-scientist that transforms scientific hypotheses into comprehensive experimental plans." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4aa65eae-2e43-4022-a67b-ff9dc201894d/id-preview-cc7538eb--b3c8866d-8f27-4982-b3f0-12ddd96eaf70.lovable.app-1777180956151.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4aa65eae-2e43-4022-a67b-ff9dc201894d/id-preview-cc7538eb--b3c8866d-8f27-4982-b3f0-12ddd96eaf70.lovable.app-1777180956151.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  );
}
