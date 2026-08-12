"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "../actions";
import { toast } from "sonner";

export function CommentForm({ sampleId }: { sampleId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = () => {
    if (!body.trim() && !file) {
      toast.error("Add a comment or an image.");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("sampleId", sampleId);
        fd.set("body", body);
        if (file) {
          // Upload the reference image straight to Blob (bypasses the body cap),
          // then attach its URL to the comment.
          const blob = await upload(`comments/${sampleId}/${Date.now()}-${file.name}`, file, {
            access: "public",
            handleUploadUrl: "/api/import/blob-upload",
          });
          fd.set("imageUrl", blob.url);
        }
        const res = await addComment(fd);
        if (res.ok) {
          setBody("");
          pick(null);
          if (inputRef.current) inputRef.current.value = "";
          toast.success("Comment added");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add comment");
      }
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        rows={2}
      />
      {preview && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="attachment preview" className="h-20 w-20 rounded border border-[var(--border)] object-contain bg-white" />
          <button
            type="button"
            onClick={() => { pick(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="absolute -right-2 -top-2 rounded-full bg-[var(--destructive)] p-0.5 text-white"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
          <ImagePlus className="h-4 w-4" /> {file ? "Change image" : "Attach image"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <Button size="sm" onClick={submit} disabled={pending || (!body.trim() && !file)}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
