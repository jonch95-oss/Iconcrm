"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addCommentImages, removeCommentImage } from "../actions";
import { MAX_COMMENT_IMAGES } from "@/lib/comment-images";
import { uploadCommentImages } from "@/lib/upload-images";

/**
 * The photos on a posted comment: every view, with the means to add the one
 * you took after writing the note, or drop the one that came out wrong.
 */
export function CommentImages({
  commentId,
  sampleId,
  images,
  canEdit,
}: {
  commentId: string;
  sampleId: string;
  images: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addImages = (picked: FileList | null) => {
    if (!picked?.length) return;
    const files = Array.from(picked);
    if (inputRef.current) inputRef.current.value = "";
    start(async () => {
      try {
        const { urls, rejected } = await uploadCommentImages(`comments/${sampleId}`, files);
        if (rejected.length)
          toast.error(`Couldn't read ${rejected.join(", ")} — save as JPEG or PNG and try again.`);
        if (urls.length === 0) return;
        const res = await addCommentImages(commentId, urls);
        if (res.ok) {
          toast.success(urls.length > 1 ? `${urls.length} images added` : "Image added");
          router.refresh();
        } else toast.error(res.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    });
  };

  const remove = (url: string) =>
    start(async () => {
      const res = await removeCommentImage(commentId, url);
      if (res.ok) {
        toast.success("Image removed");
        router.refresh();
      } else toast.error(res.error);
    });

  if (images.length === 0 && !canEdit) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {images.map((url, i) => (
        <div key={url} className="relative">
          <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`reference ${i + 1} of ${images.length}`}
              className="h-24 w-24 rounded border border-[var(--border)] bg-white object-contain"
            />
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(url)}
              disabled={pending}
              className="absolute -right-2 -top-2 rounded-full bg-[var(--destructive)] p-0.5 text-white disabled:opacity-50"
              aria-label={`Remove image ${i + 1}`}
              title="Remove this image"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {canEdit && images.length < MAX_COMMENT_IMAGES && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-24 w-24 flex-col gap-1 border-dashed text-xs"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {pending ? "Adding…" : images.length ? "Add view" : "Add image"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addImages(e.target.files)}
          />
        </>
      )}
    </div>
  );
}
