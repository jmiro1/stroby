"use client";

import { useState, useRef, useCallback } from "react";
import { Zap, CheckCircle, AlertCircle, Upload, Key, FileImage, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

type Tab = "beehiiv" | "convertkit" | "screenshot";

type VerifyResult = {
  success: boolean;
  error?: string;
  status?: "verified" | "review" | "pending_review";
  message?: string;
  metrics?: Record<string, number | string | null>;
  discrepancies?: string[];
};

export function VerifyForm({
  newsletterId,
  newsletterName,
}: {
  newsletterId: string;
  newsletterName: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("screenshot");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Please upload a PNG, JPEG, WebP, GIF, or PDF file.";
    }
    if (file.size > MAX_SIZE) {
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`;
    }
    if (file.size < 5 * 1024) {
      return "File too small — this doesn't look like a screenshot.";
    }
    return null;
  }, []);

  function handleFileSelect(file: File) {
    const error = validateFile(file);
    if (error) {
      setResult({ success: false, error });
      return;
    }
    setSelectedFile(file);
    setResult(null);
  }

  async function handleBeehiiv() {
    if (!apiKey.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify/beehiiv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function handleConvertKit() {
    if (!apiSecret.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify/convertkit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsletterId, apiSecret: apiSecret.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function handleScreenshotUpload() {
    if (!selectedFile) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("newsletterId", newsletterId);
      const res = await fetch("/api/verify/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true });
        setSelectedFile(null);
      } else {
        setResult({ success: false, error: data.error || "Upload failed." });
      }
    } catch {
      setResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "screenshot", label: "Screenshot" },
    { key: "beehiiv", label: "Beehiiv" },
    { key: "convertkit", label: "ConvertKit" },
  ];

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="size-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Stroby</span>
        </div>
        <CardTitle>Verify {newsletterName}</CardTitle>
        <CardDescription>
          Connect your newsletter platform to verify your metrics automatically,
          or upload a screenshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tab Buttons */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setResult(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Beehiiv Tab */}
        {activeTab === "beehiiv" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="beehiiv-key">
                Beehiiv API Key
              </label>
              <div className="relative">
                <Key className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="beehiiv-key"
                  type="password"
                  placeholder="Enter your Beehiiv API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Find your API key in Beehiiv under Settings &rarr; Integrations
                &rarr; API.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleBeehiiv}
              disabled={loading || !apiKey.trim()}
            >
              {loading ? "Verifying..." : "Verify with Beehiiv"}
            </Button>
          </div>
        )}

        {/* ConvertKit Tab */}
        {activeTab === "convertkit" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ck-secret">
                ConvertKit API Secret
              </label>
              <div className="relative">
                <Key className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ck-secret"
                  type="password"
                  placeholder="Enter your ConvertKit API secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Find your API secret in ConvertKit under Settings &rarr;
                Advanced &rarr; API.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleConvertKit}
              disabled={loading || !apiSecret.trim()}
            >
              {loading ? "Verifying..." : "Verify with ConvertKit"}
            </Button>
          </div>
        )}

        {/* Screenshot Tab — Drag & Drop */}
        {activeTab === "screenshot" && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {!selectedFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 sm:p-8 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <Upload className="size-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Drop your screenshot here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG, JPEG, WebP, GIF, or PDF — max 10MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
                <FileImage className="size-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedFile(null); setResult(null); }}
                  className="shrink-0 rounded-full p-1 hover:bg-muted"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Upload a screenshot of your analytics dashboard showing subscriber
              count, open rate, and date. This helps us verify your audience.
            </p>

            <Button
              className="w-full"
              onClick={handleScreenshotUpload}
              disabled={loading || !selectedFile}
            >
              {loading ? "Uploading..." : "Submit Screenshot"}
            </Button>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              result.status === "verified"
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : result.success
                ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}
          >
            {result.status === "verified" ? (
              <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
            ) : result.success ? (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            ) : (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="space-y-1 text-sm">
              {result.status === "verified" ? (
                <>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Verified! ✅ You may close this page.
                  </p>
                  {result.metrics && (
                    <p className="text-green-700 dark:text-green-300">
                      {result.metrics.subscribers ? `${Number(result.metrics.subscribers).toLocaleString()} subscribers` : ""}
                      {result.metrics.openRate ? `, ${Number(result.metrics.openRate).toFixed(1)}% open rate` : ""}
                      {result.metrics.ctr ? `, ${Number(result.metrics.ctr).toFixed(1)}% CTR` : ""}
                      {result.metrics.platform ? ` (${result.metrics.platform})` : ""}
                    </p>
                  )}
                </>
              ) : result.success ? (
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {result.message || "Upload received — we'll review it shortly."} You may close this page.
                </p>
              ) : (
                <p className="font-medium text-red-800 dark:text-red-200">
                  {result.error ?? "Something went wrong. Please try again."}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
