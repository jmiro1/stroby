"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NICHES,
  BUDGET_RANGES,
  CAMPAIGN_GOALS,
  TIMELINES,
  AD_FORMATS,
  FREQUENCIES,
} from "@/lib/constants";
import { MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatWidgetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userType: "newsletter" | "business" | null;
}

interface ChatMessage {
  role: "bot" | "user";
  content: string;
}

type StepInputType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "multi-checkbox";

interface Step {
  question: string;
  field: string;
  inputType: StepInputType;
  options?: readonly string[];
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const NEWSLETTER_STEPS: Step[] = [
  {
    question: "What's your newsletter called?",
    field: "newsletterName",
    inputType: "text",
    placeholder: "e.g., The Morning Brew",
  },
  {
    question: "What's the URL?",
    field: "url",
    inputType: "text",
    placeholder: "https://...",
  },
  {
    question: "What's your primary niche?",
    field: "niche",
    inputType: "select",
    options: NICHES,
  },
  {
    question: "Briefly describe your audience and typical topics.",
    field: "audienceDescription",
    inputType: "textarea",
    placeholder: "e.g., Marketing managers at mid-size SaaS companies...",
  },
  {
    question: "How many subscribers do you have?",
    field: "subscribers",
    inputType: "number",
    placeholder: "e.g., 15000",
  },
  {
    question: "What's your average open rate? (e.g., 42)",
    field: "openRate",
    inputType: "number",
    placeholder: "e.g., 42",
  },
  {
    question: "What's your average click-through rate? (e.g., 3.5)",
    field: "clickRate",
    inputType: "number",
    placeholder: "e.g., 3.5",
  },
  {
    question:
      "How much do you charge per placement? (in USD, or type 'not sure')",
    field: "pricing",
    inputType: "text",
    placeholder: "e.g., $500 or not sure",
  },
  {
    question: "What ad formats do you accept?",
    field: "adFormats",
    inputType: "multi-checkbox",
    options: AD_FORMATS,
  },
  {
    question: "How often do you publish?",
    field: "frequency",
    inputType: "select",
    options: FREQUENCIES,
  },
  {
    question: "What's your email address?",
    field: "email",
    inputType: "text",
    placeholder: "you@example.com",
  },
  {
    question:
      "What's your WhatsApp number? (with country code, e.g., +1...)",
    field: "whatsapp",
    inputType: "text",
    placeholder: "+1 555 123 4567",
  },
];

const BUSINESS_STEPS: Step[] = [
  {
    question: "What's your company name?",
    field: "companyName",
    inputType: "text",
    placeholder: "e.g., Acme Corp",
  },
  {
    question: "What's your name and role?",
    field: "nameAndRole",
    inputType: "text",
    placeholder: "e.g., Jane Doe, Head of Marketing",
  },
  {
    question: "What does your company sell or offer?",
    field: "offering",
    inputType: "textarea",
    placeholder: "Describe your product or service...",
  },
  {
    question: "Who's your ideal customer?",
    field: "idealCustomer",
    inputType: "textarea",
    placeholder: "e.g., Series A+ startup founders in the US...",
  },
  {
    question: "What's your primary niche?",
    field: "niche",
    inputType: "select",
    options: NICHES,
  },
  {
    question:
      "Describe the kind of newsletter audience you want to reach.",
    field: "targetAudience",
    inputType: "textarea",
    placeholder: "e.g., Technical decision-makers at B2B companies...",
  },
  {
    question:
      "What's your monthly marketing budget for newsletter sponsorships?",
    field: "budget",
    inputType: "select",
    options: BUDGET_RANGES,
  },
  {
    question: "What's your main campaign goal?",
    field: "campaignGoal",
    inputType: "select",
    options: CAMPAIGN_GOALS,
  },
  {
    question: "What's your timeline?",
    field: "timeline",
    inputType: "select",
    options: TIMELINES,
  },
  {
    question: "What's your email address?",
    field: "email",
    inputType: "text",
    placeholder: "you@example.com",
  },
  {
    question:
      "What's your WhatsApp number? (with country code, e.g., +1...)",
    field: "whatsapp",
    inputType: "text",
    placeholder: "+1 555 123 4567",
  },
];

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <BotAvatar />
      <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <MessageSquare className="size-3.5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "bot") {
    return (
      <div className="flex items-start gap-2.5">
        <BotAvatar />
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {message.content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatWidget({
  isOpen,
  onOpenChange,
  userType,
}: ChatWidgetProps) {
  const steps = userType === "newsletter" ? NEWSLETTER_STEPS : BUSINESS_STEPS;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [inputValue, setInputValue] = useState("");
  const [selectValue, setSelectValue] = useState("");
  const [checkedValues, setCheckedValues] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages, typing, or step changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // Use requestAnimationFrame for reliable scroll after render
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, isTyping, currentStep, isComplete]);

  // Focus input when step changes and typing finishes
  useEffect(() => {
    if (!isTyping && !isComplete && !isSubmitting) {
      const timer = setTimeout(() => {
        const step = steps[currentStep];
        if (step?.inputType === "textarea") {
          textareaRef.current?.focus();
        } else if (
          step?.inputType === "text" ||
          step?.inputType === "number"
        ) {
          inputRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isTyping, currentStep, isComplete, isSubmitting, steps]);

  // Send the first bot message when the widget opens
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (isOpen && userType && !hasInitialized.current) {
      hasInitialized.current = true;
      const greeting =
        userType === "newsletter"
          ? "Hey! I'm Stroby. Let's get your newsletter set up to receive sponsorships. I'll ask you a few questions."
          : "Hey! I'm Stroby. Let's find the perfect newsletters for your brand. I'll ask you a few questions.";

      setIsTyping(true);
      const t1 = setTimeout(() => {
        setMessages([{ role: "bot", content: greeting }]);
        setIsTyping(false);
        // Then show the first question
        setIsTyping(true);
        const t2 = setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { role: "bot", content: steps[0].question },
          ]);
          setIsTyping(false);
        }, 400);
        return () => clearTimeout(t2);
      }, 500);
      return () => clearTimeout(t1);
    }
  }, [isOpen, userType, steps]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      // Small delay so sheet animation finishes before clearing
      const t = setTimeout(() => {
        setMessages([]);
        setCurrentStep(0);
        setFormData({});
        setInputValue("");
        setSelectValue("");
        setCheckedValues([]);
        setIsTyping(false);
        setIsSubmitting(false);
        setIsComplete(false);
        hasInitialized.current = false;
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Advance to next step with typing indicator
  const advanceToNextStep = useCallback(
    (nextStepIndex: number) => {
      setIsTyping(true);
      setTimeout(() => {
        if (nextStepIndex < steps.length) {
          setMessages((prev) => [
            ...prev,
            { role: "bot", content: steps[nextStepIndex].question },
          ]);
          setCurrentStep(nextStepIndex);
        }
        setIsTyping(false);
      }, 400);
    },
    [steps]
  );

  // Submit final data
  const submitData = useCallback(
    async (finalData: Record<string, unknown>) => {
      setIsSubmitting(true);
      setIsTyping(true);

      setTimeout(async () => {
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: "Great, let me save your info..." },
        ]);
        setIsTyping(false);

        try {
          const res = await fetch("/api/onboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...finalData, userType }),
          });

          if (!res.ok) throw new Error("Failed to submit");

          setIsComplete(true);
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              content:
                "You're all set! Check your WhatsApp \u2014 Stroby will message you shortly.",
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              content:
                "Something went wrong. Please try again or reach out to us directly.",
            },
          ]);
        } finally {
          setIsSubmitting(false);
        }
      }, 400);
    },
    [userType]
  );

  // Handle user answer submission
  const handleSubmit = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    let displayValue = "";
    let dataValue: unknown;

    switch (step.inputType) {
      case "text": {
        const v = inputValue.trim();
        if (!v) return;
        displayValue = v;
        dataValue = v;
        break;
      }
      case "number": {
        const v = inputValue.trim();
        if (!v) return;
        displayValue = v;
        dataValue = parseFloat(v);
        break;
      }
      case "textarea": {
        const v = inputValue.trim();
        if (!v) return;
        displayValue = v;
        dataValue = v;
        break;
      }
      case "select": {
        if (!selectValue) return;
        displayValue = selectValue;
        dataValue = selectValue;
        break;
      }
      case "multi-checkbox": {
        if (checkedValues.length === 0) return;
        displayValue = checkedValues.join(", ");
        dataValue = checkedValues;
        break;
      }
    }

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: displayValue }]);

    // Update form data
    const updatedData = { ...formData, [step.field]: dataValue };
    setFormData(updatedData);

    // Reset inputs
    setInputValue("");
    setSelectValue("");
    setCheckedValues([]);

    const nextStep = currentStep + 1;
    if (nextStep >= steps.length) {
      submitData(updatedData);
    } else {
      advanceToNextStep(nextStep);
    }
  }, [
    steps,
    currentStep,
    inputValue,
    selectValue,
    checkedValues,
    formData,
    advanceToNextStep,
    submitData,
  ]);

  // Handle enter key for text/number inputs
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Toggle a checkbox value
  const toggleCheckbox = (value: string) => {
    setCheckedValues((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  };

  // ---------------------------------------------------------------------------
  // Render the current input
  // ---------------------------------------------------------------------------

  function renderInput() {
    if (isComplete || isSubmitting || isTyping) return null;

    const step = steps[currentStep];
    if (!step) return null;

    switch (step.inputType) {
      case "text":
        return (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={step.placeholder}
              className="h-10 flex-1 rounded-xl"
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="size-10 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          </div>
        );

      case "number":
        return (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={step.placeholder}
              className="h-10 flex-1 rounded-xl"
              min={0}
              step="any"
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="size-10 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          </div>
        );

      case "textarea":
        return (
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={step.placeholder}
              className="min-h-10 flex-1 rounded-xl"
              rows={2}
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="size-10 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          </div>
        );

      case "select":
        return (
          <div className="flex items-center gap-2">
            <Select value={selectValue} onValueChange={(v) => setSelectValue(v ?? "")}>
              <SelectTrigger className="h-10 w-full flex-1 rounded-xl">
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent>
                {step.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!selectValue}
              className="size-10 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          </div>
        );

      case "multi-checkbox":
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {step.options?.map((opt) => {
                const isChecked = checkedValues.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleCheckbox(opt)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      isChecked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={checkedValues.length === 0}
              className="w-full rounded-xl"
              size="lg"
            >
              <Send className="size-4" />
              <span>Confirm selection</span>
            </Button>
          </div>
        );

      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MessageSquare className="size-3.5" />
            </div>
            {userType === "newsletter"
              ? "Newsletter Onboarding"
              : "Business Onboarding"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {userType === "newsletter"
              ? "Set up your newsletter to receive sponsorships"
              : "Find the perfect newsletters for your brand"}
          </SheetDescription>
        </SheetHeader>

        {/* Chat area */}
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        >
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}

          {/* Success state */}
          {isComplete && (
            <div className="my-4 flex flex-col items-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          )}

          {/* Submitting state */}
          {isSubmitting && !isTyping && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Input area at bottom */}
        {!isComplete && (
          <div className="border-t bg-background px-4 py-3">
            {renderInput()}
            {/* Progress indicator */}
            {!isTyping && !isSubmitting && currentStep < steps.length && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${((currentStep) / steps.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {currentStep + 1}/{steps.length}
                </span>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
