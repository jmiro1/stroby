"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { MessageSquare } from "lucide-react";

interface ChatWidgetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userType: "newsletter" | "business" | null;
}

export default function ChatWidget({
  isOpen,
  onOpenChange,
  userType,
}: ChatWidgetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            {userType === "newsletter"
              ? "Newsletter Owner Onboarding"
              : userType === "business"
                ? "Business Onboarding"
                : "Welcome to Stroby"}
          </SheetTitle>
          <SheetDescription>
            {userType === "newsletter"
              ? "Let's get your newsletter set up to receive sponsorships."
              : userType === "business"
                ? "Let's find the perfect newsletters for your brand."
                : "Tell us how we can help you."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <MessageSquare className="size-8 text-primary" />
          </div>
          <p className="text-lg font-medium text-foreground">
            Chat widget coming soon
          </p>
          <p className="text-sm text-muted-foreground">
            {userType === "newsletter"
              ? "You'll be able to onboard your newsletter through an AI-guided chat."
              : userType === "business"
                ? "You'll be able to describe your ideal sponsorship match through an AI chat."
                : "Our AI assistant will help you get started."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
