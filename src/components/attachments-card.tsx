"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attachFile, deleteAttachment } from "@/app/(app)/attachments-actions";

export interface AttachmentView {
  id: string;
  filename: string;
  blobUrl: string;
  mimeType: string | null;
}

export function AttachmentsCard({
  parentType,
  parentId,
  attachments,
  canEdit,
  title = "Files",
}: {
  parentType: string;
  parentId: string;
  attachments: AttachmentView[];
  canEdit: boolean;
  title?: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/import/blob-upload" });
      const res = await attachFile(parentType, parentId, blob.url, file.name, file.type);
      if (res.ok) {
        toast.success("File attached");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    deleteAttachment(id).then((res) => {
      if (res.ok) {
        toast.success("Removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>
          {title} ({attachments.length})
        </CardTitle>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,image/*"
              className="hidden"
              onChange={onPick}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No files attached yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] p-2">
                <Paperclip className="h-4 w-4 text-[var(--muted-foreground)]" />
                <a href={a.blobUrl} target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:underline">
                  {a.filename}
                </a>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    onClick={() => onDelete(a.id, a.filename)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
