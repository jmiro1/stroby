"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
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
} from "@/lib/constants";
import { Send, CheckCircle2, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserType = "business" | "influencer" | "other" | null;

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
  /** Only show this step if formData[conditionField] === conditionValue */
  conditionField?: string;
  conditionValue?: string;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const PLATFORMS = [
  "Newsletter",
  "YouTube",
  "Instagram",
  "TikTok",
  "Podcast",
  "Blog",
  "LinkedIn",
  "X / Twitter",
  "Other",
] as const;

const PARTNERSHIP_TYPES = [
  "Sponsored content",
  "Product reviews",
  "Affiliate deals",
  "Brand ambassador",
  "Dedicated sends",
  "Other",
] as const;

const INFLUENCER_STEPS: Step[] = [
  { question: "What platform is your audience on?", field: "platform", inputType: "select", options: PLATFORMS },
  { question: "What's your channel or account name?", field: "channel_name", inputType: "text", placeholder: "e.g., The Marketing Brief" },
  { question: "What's your name?", field: "owner_name", inputType: "text", placeholder: "e.g., Jane Doe" },
  { question: "Drop a link to your content so we can check it out.", field: "url", inputType: "text", placeholder: "https://..." },
  { question: "What niche best describes your content?", field: "primary_niche", inputType: "select", options: NICHES },
  { question: "What's your niche? Describe it briefly.", field: "custom_niche", inputType: "text", placeholder: "e.g., Pet care, Automotive, Gaming...", conditionField: "primary_niche", conditionValue: "Other" },
  { question: "Tell me about your audience — who are they and what do they care about?", field: "description", inputType: "textarea", placeholder: "e.g., CMOs and growth leads at B2B SaaS companies..." },
  { question: "How large is your audience? (subscribers, followers, etc.)", field: "audience_size", inputType: "number", placeholder: "e.g., 15000" },
  { question: "What's your typical engagement rate? The more detail you give, the better we can match you.", field: "engagement_rate", inputType: "text", placeholder: "e.g., 42% open rate, 5% CTR, 10k avg views" },
  { question: "What types of brand partnerships interest you?", field: "partnership_types", inputType: "multi-checkbox", options: PARTNERSHIP_TYPES },
  { question: "What do you typically charge per partnership? (or type 'not sure yet')", field: "price_per_placement", inputType: "text", placeholder: "e.g., $500 or not sure yet" },
  { question: "What's your email?", field: "email", inputType: "text", placeholder: "you@example.com" },
  { question: "Last one — what's your WhatsApp number? (with country code)", field: "phone", inputType: "text", placeholder: "+1 555 123 4567" },
];

const BUSINESS_STEPS: Step[] = [
  { question: "What's your company name?", field: "company_name", inputType: "text", placeholder: "e.g., Acme Corp" },
  { question: "What's your name?", field: "contact_name", inputType: "text", placeholder: "e.g., Jane Doe" },
  { question: "What's your role there?", field: "contact_role", inputType: "text", placeholder: "e.g., Head of Marketing" },
  { question: "In a sentence or two, what does your company sell?", field: "product_description", inputType: "textarea", placeholder: "e.g., Email automation software for e-commerce brands" },
  { question: "Who's your ideal customer?", field: "target_customer", inputType: "textarea", placeholder: "e.g., DTC brand founders doing $1M-$10M revenue" },
  { question: "What niche are you targeting?", field: "primary_niche", inputType: "select", options: NICHES },
  { question: "What's your niche? Describe it briefly.", field: "custom_niche", inputType: "text", placeholder: "e.g., Pet care, Automotive, Gaming...", conditionField: "primary_niche", conditionValue: "Other" },
  { question: "What kind of audience do you want to get in front of?", field: "description", inputType: "textarea", placeholder: "e.g., Marketing decision-makers at mid-market companies..." },
  { question: "What's your monthly budget for sponsorships or partnerships?", field: "budget_range", inputType: "select", options: BUDGET_RANGES },
  { question: "What's the main goal for this campaign?", field: "campaign_goal", inputType: "select", options: CAMPAIGN_GOALS },
  { question: "How soon are you looking to get started?", field: "timeline", inputType: "select", options: TIMELINES },
  { question: "What's your email?", field: "email", inputType: "text", placeholder: "you@example.com" },
  { question: "Last one — what's your WhatsApp number? (with country code)", field: "phone", inputType: "text", placeholder: "+1 555 123 4567" },
];

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stroby_onboarding";

interface SavedDraft {
  userType: "business" | "influencer";
  step: number;
  data: Record<string, unknown>;
  messages: ChatMessage[];
}

function saveDraft(draft: SavedDraft) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch { /* noop */ }
}

function loadDraft(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedDraft;
  } catch { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BotAvatar() {
  return (
    <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-primary">
      <Image
        src="/logo-emoji.png"
        alt="Stroby"
        width={32}
        height={32}
        className="size-full object-cover"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          if (target.parentElement) {
            target.parentElement.innerHTML =
              '<span class="flex size-full items-center justify-center text-sm font-bold text-primary-foreground">S</span>';
          }
        }}
      />
    </div>
  );
}

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

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "bot") {
    return (
      <div className="flex items-start gap-2.5">
        <BotAvatar />
        <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground">
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

export default function OnboardingChat() {
  const [userType, setUserType] = useState<UserType>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [inputValue, setInputValue] = useState("");
  const [selectValue, setSelectValue] = useState("");
  const [checkedValues, setCheckedValues] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showRoleSelect, setShowRoleSelect] = useState(true);
  // For "other" free-form chat mode
  const [isFreeChat, setIsFreeChat] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const steps = userType === "influencer" ? INFLUENCER_STEPS : BUSINESS_STEPS;

  // Scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [messages, isTyping, currentStep, isComplete, showRoleSelect]);

  // Focus input when step changes
  useEffect(() => {
    if (!isTyping && !isComplete && !isSubmitting && (userType || isFreeChat)) {
      const timer = setTimeout(() => {
        if (isFreeChat) {
          inputRef.current?.focus();
          return;
        }
        const step = steps[currentStep];
        if (step?.inputType === "textarea") textareaRef.current?.focus();
        else if (step?.inputType === "text" || step?.inputType === "number") inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isTyping, currentStep, isComplete, isSubmitting, steps, userType, isFreeChat]);

  // Initialize with greeting
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Check for saved draft (only for survey flows)
    const draft = loadDraft();
    if (draft && draft.step > 0) {
      setUserType(draft.userType);
      setMessages(draft.messages);
      setFormData(draft.data);
      setCurrentStep(draft.step);
      setShowRoleSelect(false);

      const draftSteps = draft.userType === "influencer" ? INFLUENCER_STEPS : BUSINESS_STEPS;
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: "Welcome back! Let's pick up where we left off." },
        ]);
        setIsTyping(false);
        setIsTyping(true);
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { role: "bot", content: draftSteps[draft.step].question },
          ]);
          setIsTyping(false);
        }, 400);
      }, 300);
      return;
    }

    // Fresh start
    setIsTyping(true);
    setTimeout(() => {
      setMessages([
        {
          role: "bot",
          content:
            "Hey! I'm Stroby, your AI Superconnector for brand distribution. I connect awesome companies to influencers and vice versa.\n\nTell me who you are and I'll connect you with relevant businesses, influencers, or other people that would be valuable for you.",
        },
      ]);
      setIsTyping(false);
    }, 500);
  }, []);

  // Handle role selection
  function selectRole(type: "business" | "influencer" | "other") {
    const labels: Record<string, string> = {
      business: "I represent a business",
      influencer: "I have an engaged audience",
      other: "Other",
    };

    setShowRoleSelect(false);
    setMessages((prev) => [...prev, { role: "user", content: labels[type] }]);

    if (type === "other") {
      // Free-form Claude conversation
      setUserType("other");
      setIsFreeChat(true);

      const firstAssistantMsg = "Nice! Tell me a bit about yourself — what do you do and what kind of connections are you looking for?";
      const initialHistory: { role: "user" | "assistant"; content: string }[] = [
        { role: "user", content: "Other" },
        { role: "assistant", content: firstAssistantMsg },
      ];
      setChatHistory(initialHistory);

      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "bot", content: firstAssistantMsg }]);
        setIsTyping(false);
      }, 400);
      return;
    }

    const greetings: Record<string, string> = {
      business: "Great! Let's find the right creators and channels to get your brand in front of the right audience. Quick survey — takes about 2 minutes.",
      influencer: "Awesome! Let's get you set up so brands can find and partner with you. Quick survey — takes about 2 minutes.",
    };

    const selectedSteps = type === "influencer" ? INFLUENCER_STEPS : BUSINESS_STEPS;

    setUserType(type);
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "bot", content: greetings[type] }]);
      setIsTyping(false);
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: selectedSteps[0].question },
        ]);
        setIsTyping(false);
      }, 400);
    }, 400);
  }

  // ── Free-form chat (Claude API) ──

  const sendFreeMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isSubmitting) return;

    const userMsg = text;
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    const updatedHistory = [...chatHistory, { role: "user" as const, content: userMsg }];
    setChatHistory(updatedHistory);

    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedHistory }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();
      const botReply = data.message || "Sorry, I didn't catch that. Could you try again?";

      setChatHistory((prev) => [...prev, { role: "assistant", content: botReply }]);
      setMessages((prev) => [...prev, { role: "bot", content: botReply }]);
      setIsTyping(false);

      if (data.complete && data.profileData) {
        // Profile extracted — submit to onboard API
        setIsSubmitting(true);
        setIsTyping(true);
        setTimeout(async () => {
          setMessages((prev) => [...prev, { role: "bot", content: "Saving your profile..." }]);
          setIsTyping(false);

          try {
            const onboardRes = await fetch("/api/onboard", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userType: "other", data: data.profileData }),
            });

            if (!onboardRes.ok) throw new Error("Onboard failed");

            clearDraft();
            setIsComplete(true);
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                content: "You're all set! We'll send your connections and updates via WhatsApp. Tap below to say hi.",
              },
            ]);
          } catch {
            setMessages((prev) => [
              ...prev,
              { role: "bot", content: "Something went wrong saving your info. Please try again." },
            ]);
            setIsSubmitting(false);
          }
        }, 400);
      }
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "Something went wrong. Please try again." },
      ]);
    }
  }, [inputValue, chatHistory, isSubmitting]);

  // ── Survey flow ──

  const submitData = useCallback(
    async (finalData: Record<string, unknown>) => {
      setIsSubmitting(true);
      setIsTyping(true);

      setTimeout(async () => {
        setMessages((prev) => [...prev, { role: "bot", content: "Perfect — saving your profile..." }]);
        setIsTyping(false);

        try {
          const res = await fetch("/api/onboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userType, data: finalData }),
          });

          if (!res.ok) throw new Error("Failed to submit");

          clearDraft();
          setIsComplete(true);
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              content: "You're all set! We'll send your matches and updates via WhatsApp. Tap below to say hi and get started.",
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            { role: "bot", content: "Something went wrong saving your info. Please try again." },
          ]);
          setIsSubmitting(false);
        }
      }, 400);
    },
    [userType]
  );

  // Find next step that isn't skipped by a condition
  function findNextStep(fromIndex: number, data: Record<string, unknown>): number {
    let idx = fromIndex;
    while (idx < steps.length) {
      const s = steps[idx];
      if (s.conditionField && s.conditionValue) {
        if (data[s.conditionField] !== s.conditionValue) {
          idx++;
          continue;
        }
      }
      break;
    }
    return idx;
  }

  const advanceToNextStep = useCallback(
    (nextStepIndex: number, updatedMessages: ChatMessage[], updatedData: Record<string, unknown>) => {
      const actualNext = findNextStep(nextStepIndex, updatedData);
      if (userType && userType !== "other") {
        saveDraft({ userType, step: actualNext, data: updatedData, messages: updatedMessages });
      }
      if (actualNext >= steps.length) {
        submitData(updatedData);
        return;
      }
      setIsTyping(true);
      setTimeout(() => {
        if (actualNext < steps.length) {
          setMessages((prev) => [...prev, { role: "bot", content: steps[actualNext].question }]);
          setCurrentStep(actualNext);
        }
        setIsTyping(false);
      }, 400);
    },
    [steps, userType, submitData]
  );

  const handleSubmit = useCallback(() => {
    // Free chat mode
    if (isFreeChat) {
      sendFreeMessage();
      return;
    }

    const step = steps[currentStep];
    if (!step) return;

    let displayValue = "";
    let dataValue: unknown;

    switch (step.inputType) {
      case "text":
      case "number":
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

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: displayValue }];
    setMessages(newMessages);

    const updatedData = { ...formData, [step.field]: dataValue };
    setFormData(updatedData);

    setInputValue("");
    setSelectValue("");
    setCheckedValues([]);

    advanceToNextStep(currentStep + 1, newMessages, updatedData);
  }, [isFreeChat, sendFreeMessage, steps, currentStep, inputValue, selectValue, checkedValues, formData, messages, advanceToNextStep, submitData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleCheckbox = (value: string) => {
    setCheckedValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // ---------------------------------------------------------------------------
  // Render input
  // ---------------------------------------------------------------------------

  function renderInput() {
    if (isComplete || isSubmitting || isTyping) return null;

    // Free chat mode — always show text input
    if (isFreeChat) {
      return (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="h-10 flex-1 rounded-full border-muted-foreground/20 bg-muted/50 text-sm"
          />
          <Button size="icon" onClick={handleSubmit} disabled={!inputValue.trim()} className="size-10 shrink-0 rounded-full">
            <Send className="size-4" />
          </Button>
        </div>
      );
    }

    if (!userType) return null;

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
              className="h-10 flex-1 rounded-full border-muted-foreground/20 bg-muted/50 text-sm"
            />
            <Button size="icon" onClick={handleSubmit} disabled={!inputValue.trim()} className="size-10 shrink-0 rounded-full">
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
              className="h-10 flex-1 rounded-full border-muted-foreground/20 bg-muted/50 text-sm"
              min={0}
              step="any"
            />
            <Button size="icon" onClick={handleSubmit} disabled={!inputValue.trim()} className="size-10 shrink-0 rounded-full">
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
              className="min-h-10 flex-1 rounded-2xl border-muted-foreground/20 bg-muted/50 text-sm"
              rows={2}
            />
            <Button size="icon" onClick={handleSubmit} disabled={!inputValue.trim()} className="size-10 shrink-0 rounded-full">
              <Send className="size-4" />
            </Button>
          </div>
        );

      case "select":
        return (
          <div className="flex items-center gap-2">
            <Select value={selectValue} onValueChange={(v) => setSelectValue(v ?? "")}>
              <SelectTrigger className="h-10 w-full flex-1 rounded-full border-muted-foreground/20 bg-muted/50 text-sm">
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent>
                {step.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" onClick={handleSubmit} disabled={!selectValue} className="size-10 shrink-0 rounded-full">
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
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
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
            <Button onClick={handleSubmit} disabled={checkedValues.length === 0} className="w-full rounded-full" size="default">
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
    <div className="flex h-full flex-col">
      {/* WhatsApp-style header */}
      <div className="flex items-center gap-3 border-b bg-primary px-4 py-3">
        <div className="relative size-9 overflow-hidden rounded-full bg-primary-foreground/20">
          <Image
            src="/logo-emoji.png"
            alt="Stroby"
            width={36}
            height={36}
            className="size-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              if (target.parentElement) {
                target.parentElement.innerHTML =
                  '<span class="flex size-full items-center justify-center text-sm font-bold text-primary-foreground">S</span>';
              }
            }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-primary-foreground">Stroby</p>
          <p className="text-xs text-primary-foreground/70">AI Superconnector</p>
        </div>
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}

        {/* Role selection buttons */}
        {showRoleSelect && !isTyping && messages.length > 0 && (
          <div className="flex flex-col gap-2 pl-10">
            <button
              onClick={() => selectRole("business")}
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              I represent a business
            </button>
            <button
              onClick={() => selectRole("influencer")}
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              I have an engaged audience
            </button>
            <button
              onClick={() => selectRole("other")}
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Other
            </button>
          </div>
        )}

        {/* Completion state */}
        {isComplete && (
          <div className="my-2 flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-6 text-green-600" />
            </div>
            <a
              href="https://wa.me/message/stroby"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat on WhatsApp
            </a>
          </div>
        )}

        {isSubmitting && !isTyping && !isComplete && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Input area */}
      {!isComplete && !showRoleSelect && (
        <div className="border-t bg-background px-3 py-2.5">
          {renderInput()}
          {!isFreeChat && !isTyping && !isSubmitting && userType && currentStep < steps.length && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(currentStep / steps.length) * 100}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentStep + 1}/{steps.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
