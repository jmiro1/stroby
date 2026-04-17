import { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog — Newsletter Sponsorship Tips & Insights | Stroby",
  description:
    "Learn about newsletter sponsorship pricing, CPM benchmarks, creator marketing strategies, and how to connect brands with newsletter creators. Tips from Stroby.",
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Stroby Blog
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
            Newsletter sponsorship insights, CPM benchmarks, and creator
            marketing strategies.
          </p>
        </div>

        {posts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-xl border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-sm"
              >
                <h2 className="text-lg font-semibold leading-tight group-hover:text-primary">
                  {post.title}
                </h2>

                {post.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {post.description}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  {post.date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatDate(post.date)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {post.readingTime} min read
                  </span>
                </div>

                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-lg font-medium">No posts yet</p>
            <p className="mt-2 text-muted-foreground">
              Check back soon for newsletter sponsorship tips and insights.
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 rounded-2xl bg-primary/5 p-8 text-center ring-1 ring-primary/10">
          <h2 className="text-2xl font-bold">
            Ready to connect with newsletter creators?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Stroby matches brands with the right creators based on audience
            alignment. Free for creators. Double opt-in. Stroby Pay protected.
          </p>
          <div className="mt-6">
            <Link href="/">
              <Button size="lg">
                Get Matched
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
