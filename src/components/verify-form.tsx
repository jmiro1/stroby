"use client";

import { useState } from "react";
import { Zap, CheckCircle, AlertCircle, Upload, Key } from "lucide-react";
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
  metrics?: Record<string, number>;
  discrepancy?: boolean;
};

export function VerifyForm({
  newsletterId,
  newsletterName,
}: {
  newsletterId: string;
  newsletterName: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("beehiiv");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

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

  async function handleScreenshot() {
    if (!screenshotUrl.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletterId,
          screenshotUrl: screenshotUrl.trim(),
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "beehiiv", label: "Beehiiv" },
    { key: "convertkit", label: "ConvertKit" },
    { key: "screenshot", label: "Screenshot" },
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

        {/* Screenshot Tab */}
        {activeTab === "screenshot" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="screenshot-url">
                Screenshot URL
              </label>
              <div className="relative">
                <Upload className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="screenshot-url"
                  type="url"
                  placeholder="https://..."
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Upload your analytics screenshot to an image host (e.g. Imgur,
                Cloudinary) and paste the URL here. Make sure the screenshot
                shows subscriber count, open rate, and date.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleScreenshot}
              disabled={loading || !screenshotUrl.trim()}
            >
              {loading ? "Submitting..." : "Submit Screenshot"}
            </Button>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              result.success
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}
          >
            {result.success ? (
              <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="space-y-1 text-sm">
              {result.success ? (
                <>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Verification successful!
                  </p>
                  {result.metrics && (
                    <p className="text-green-700 dark:text-green-300">
                      {result.metrics.subscribers?.toLocaleString()} subscribers
                      {result.metrics.openRate !== undefined &&
                        `, ${result.metrics.openRate.toFixed(1)}% open rate`}
                      {result.metrics.ctr !== undefined &&
                        `, ${result.metrics.ctr.toFixed(1)}% CTR`}
                    </p>
                  )}
                  {result.discrepancy && (
                    <p className="text-yellow-700 dark:text-yellow-300">
                      Note: Some metrics differed from what you reported. We
                      have updated them to match your platform data.
                    </p>
                  )}
                </>
              ) : (
                <p className="font-medium text-red-800 dark:text-red-200">
                  {result.error ?? "Verification failed. Please try again."}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
