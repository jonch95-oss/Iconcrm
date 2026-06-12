"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uploadSampleImage, removeSampleImage } from "../actions";
import { Camera, Trash2 } from "lucide-react";

/**
 * Primary product photo for a sample. On phones the file input opens the
 * camera roll / camera directly. The photo flows into order forms, line
 * sheets, and PI views automatically.
 */
export function SampleImage({
  sampleId,
  imageUrl,
  canEdit,
}: {
  sampleId: string;
  imageUrl: string | null;
  canEdit: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, startTransition] = React.useTransition();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("sampleId", sampleId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadSampleImage(fd);
      if (res.ok) toast.success("Photo saved — it'll appear on order forms and line sheets");
      else toast.error(res.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const onRemove = () => {
    startTransition(async () => {
      const res = await removeSampleImage(sampleId);
      if (res.ok) toast.success("Photo removed");
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-2">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="Product"
          className="h-48 w-full rounded-md border border-[var(--border)] bg-white object-contain"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
          No photo yet
        </div>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {pending ? "Uploading…" : imageUrl ? "Replace photo" : "Add photo"}
          </Button>
          {imageUrl && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
