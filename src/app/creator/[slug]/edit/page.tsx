"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Upload, X, CheckCircle, Loader2 } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";
import { SiteFooter } from "@/components/site-footer";

export default function EditCreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve params
  useState(() => {
    params.then((p) => setSlug(p.slug));
  });

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image (PNG, JPEG, or WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large — max 5MB");
      return;
    }
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setError("");
  }

  async function handleVerifyPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !slug) return;
    setVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/creator/verify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, phone: phone.trim() }),
      });
      const data = await res.json();
      if (data.verified) {
        setVerified(true);
      } else {
        setError("This phone number doesn't match the profile owner.");
      }
    } catch {
      setError("Verification failed. Try again.");
    }
    setVerifying(false);
  }

  async function handleUpload() {
    if (!selectedFile || !slug) return;
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("slug", slug);
    formData.append("phone", phone.trim());

    try {
      const res = await fetch("/api/creator/upload-avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploaded(true);
      } else {
        setError(data.error || "Upload failed.");
      }
    } catch {
      setError("Upload failed. Try again.");
    }
    setUploading(false);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MarketingHeader right={null} />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/logo-emoji.png" alt="Stroby" width={48} height={48} />
          <h1 className="text-xl font-bold">Edit Your Profile</h1>
          <p className="text-center text-sm text-muted-foreground">
            Upload your logo or avatar for your public Stroby profile.
          </p>
        </div>

        {!verified ? (
          <form onSubmit={handleVerifyPhone} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Your WhatsApp number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">Enter the phone number you used to sign up.</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={verifying || !phone.trim()}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {verifying ? "Verifying..." : "Verify ownership"}
            </button>
          </form>
        ) : uploaded ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="size-12 text-green-500" />
            <p className="text-sm font-medium">Avatar updated! You may close this page.</p>
            {slug && (
              <a href={`/creator/${slug}`} className="text-sm text-primary underline">
                View your profile
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
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
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 sm:p-8 transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drop your logo or avatar here</p>
                <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP — max 5MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {preview && (
                  <Image src={preview} alt="Preview" width={120} height={120}
                    className="rounded-full object-cover" />
                )}
                <p className="text-sm">{selectedFile.name}</p>
                <button onClick={() => { setSelectedFile(null); setPreview(null); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="size-3" /> Remove
                </button>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button onClick={handleUpload} disabled={uploading || !selectedFile}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {uploading ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Upload avatar"}
            </button>
          </div>
        )}
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
