import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getAllSlugs } from "@/lib/blog";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, ArrowRight, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post Not Found" };

  return {
    title: `${post.title} | Stroby Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to Blog
        </Link>

        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {post.title}
          </h1>

          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            {post.date && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {formatDate(post.date)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {post.readingTime} min read
            </span>
          </div>

          {post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Article body */}
        <article className="prose prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-li:text-muted-foreground prose-table:text-sm prose-th:text-left prose-th:font-semibold prose-th:text-foreground prose-td:text-muted-foreground">
          <MarkdownRenderer content={post.content} />
        </article>

        {/* CTA */}
        <div className="mt-16 rounded-2xl bg-primary/5 p-8 text-center ring-1 ring-primary/10">
          <h2 className="text-2xl font-bold">
            Join Stroby — Connect with Brands &amp; Creators
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Whether you&rsquo;re a brand looking for newsletter sponsors or a
            creator looking for brand deals, Stroby matches you with the right
            partners. Free for creators. Double opt-in.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/">
              <Button size="lg">
                Get Started Free
                <ArrowRight data-icon="inline-end" />
              </Button>
            </Link>
            <a
              href="https://wa.me/message/2QFL7QR7EBZTD1"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" variant="outline">
                Message on WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
