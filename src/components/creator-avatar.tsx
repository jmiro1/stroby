"use client";

import Image from "next/image";
import Link from "next/link";

interface CreatorAvatarProps {
  avatarUrl: string | null | undefined;
  name: string;
  slug: string;
}

export function CreatorAvatar({ avatarUrl, name, slug }: CreatorAvatarProps) {
  if (avatarUrl) {
    // Has avatar — show it, link to home
    return (
      <Link href="/" className="mb-6 transition-transform hover:scale-105">
        <Image
          src={avatarUrl}
          alt={name}
          width={120}
          height={120}
          className="size-[100px] rounded-full object-cover drop-shadow-lg sm:size-[120px]"
          priority
        />
      </Link>
    );
  }

  // No avatar — show upload placeholder, link to edit page
  return (
    <Link
      href={`/creator/${slug}/edit`}
      className="group mb-6 flex size-[100px] items-center justify-center rounded-full bg-muted/50 border-2 border-dashed border-muted-foreground/30 transition-all hover:border-primary/50 hover:bg-muted sm:size-[120px]"
    >
      <div className="flex flex-col items-center gap-1">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-muted-foreground/50 transition-colors group-hover:text-primary/60 sm:size-6"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[9px] font-medium text-muted-foreground/50 transition-colors group-hover:text-primary/60 sm:text-[10px]">
          Add logo
        </span>
      </div>
    </Link>
  );
}
