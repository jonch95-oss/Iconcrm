"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, Trash2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadOrderFormFile, deleteOrderFormFile, addOrderFormNote } from "../actions";
import { toast } from "sonner";

export function OrderFormUploader({ orderFormId }: { orderFormId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      try {
        const blob = await upload(`order-forms/${orderFormId}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/import/blob-upload",
        });
        const fd = new FormData();
        fd.set("orderFormId", orderFormId);
        fd.set("blobUrl", blob.url);
        fd.set("filename", file.name);
        fd.set("mimeType", file.type);
        const res = await uploadOrderFormFile(fd);
        if (res.ok) { toast.success("File uploaded"); router.refresh(); }
        else toast.error(res.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
        <Upload className="h-4 w-4" /> {pending ? "Uploading…" : "Upload version"}
      </Button>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
    </>
  );
}

export function DeleteFileButton({ attachmentId, orderFormId }: { attachmentId: string; orderFormId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deleteOrderFormFile(attachmentId, orderFormId);
          if (res.ok) router.refresh();
          else toast.error(res.error);
        })
      }
    >
      <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
    </Button>
  );
}

export function OrderFormNoteForm({ orderFormId }: { orderFormId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();
  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const fd = new FormData();
      fd.set("orderFormId", orderFormId);
      fd.set("body", body);
      const res = await addOrderFormNote(fd);
      if (res.ok) { setBody(""); toast.success("Note added"); router.refresh(); }
      else toast.error(res.error);
    });
  };
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" rows={2} />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          <StickyNote className="h-4 w-4" /> {pending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}
