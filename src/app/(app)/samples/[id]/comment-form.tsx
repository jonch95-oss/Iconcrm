"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "../actions";
import { MAX_COMMENT_IMAGES } from "@/lib/comment-images";
import { uploadCommentImages } from "@/lib/upload-images";
import { toast } from "sonner";

/**
 * Post a comment for production with as many reference photos as the note
 * needs — front, back, the detail of the fault.
 */
export function CommentForm({ sampleId }: { sampleId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Object URLs are revoked when the set changes, so picking and unpicking
  // photos all afternoon doesn't leak them.
  React.useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const add = (picked: FileList | null) => {
    if (!picked?.length) return;
    setFiles((current) => {
      const next = [...current, ...Array.from(picked)].slice(0, MAX_COMMENT_IMAGES);
      if (current.length + picked.length > MAX_COMMENT_IMAGES)
        toast.error(`Up to ${MAX_COMMENT_IMAGES} images per comment.`);
      return next;
    });
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeAt = (i: number) => setFiles((current) => current.filter((_, n) => n !== i));

  const submit = () => {
    if (!body.trim() && files.length === 0) {
      toast.error("Add a comment for production, or an image.");
      return;
    }
    startTransition(async () => {
      try {
        const { urls, rejected } = await uploadCommentImages(`comments/${sampleId}`, files);
        if (rejected.length)
          toast.error(`Couldn't read ${rejected.join(", ")} — save as JPEG or PNG and try again.`);
        if (!body.trim() && urls.length === 0) return;

        const fd = new FormData();
        fd.set("sampleId", sampleId);
        fd.set("body", body);
        fd.set("imageUrls", JSON.stringify(urls));
        const res = await addComment(fd);
        if (res.ok) {
          setBody("");
          setFiles([]);
          if (inputRef.current) inputRef.current.value = "";
          toast.success(urls.length > 1 ? `Comment added with ${urls.length} images` : "Comment added");
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
        placeholder="Add a comment for production…"
        rows={2}
      />
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`attachment ${i + 1}`} className="h-20 w-20 rounded border border-[var(--border)] bg-white object-contain" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute -right-2 -top-2 rounded-full bg-[var(--destructive)] p-0.5 text-white"
                aria-label={`Remove image ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
          <ImagePlus className="h-4 w-4" />
          {files.length ? `Add another image (${files.length})` : "Attach images"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
        <Button size="sm" onClick={submit} disabled={pending || (!body.trim() && files.length === 0)}>
          {pending ? "Posting…" : "Comment for production"}
        </Button>
      </div>
    </div>
  );
}
