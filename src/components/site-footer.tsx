import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative size-7 overflow-hidden rounded-md bg-primary">
              <Image
                src="/logo-emoji.png"
                alt="Stroby"
                width={28}
                height={28}
                className="size-full object-cover"
              />
            </div>
            <span className="text-base font-semibold">Stroby.ai</span>
          </Link>
          <nav className="flex gap-6 text-base text-muted-foreground">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/affiliates" className="transition-colors hover:text-foreground">
              Affiliates
            </Link>
            <Link href="/contact" className="transition-colors hover:text-foreground">
              Contact
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Stroby. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
