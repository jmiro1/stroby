import fs from "fs";
import path from "path";
import matter from "gray-matter";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  readingTime: number;
}

export interface Post extends PostMeta {
  content: string;
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  const posts: PostMeta[] = files.map((filename) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf-8");
    const { data, content } = matter(raw);

    return {
      slug: data.slug || filename.replace(/\.mdx?$/, ""),
      title: data.title || "Untitled",
      date: data.date ? String(data.date) : "",
      description: data.description || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      readingTime: estimateReadingTime(content),
    };
  });

  return posts.sort((a, b) => (a.date > b.date ? -1 : 1));
}

export function getPostBySlug(slug: string): Post | null {
  if (!fs.existsSync(POSTS_DIR)) return null;

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf-8");
    const { data, content } = matter(raw);
    const fileSlug = data.slug || filename.replace(/\.mdx?$/, "");

    if (fileSlug === slug) {
      return {
        slug: fileSlug,
        title: data.title || "Untitled",
        date: data.date ? String(data.date) : "",
        description: data.description || "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        readingTime: estimateReadingTime(content),
        content,
      };
    }
  }

  return null;
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}
