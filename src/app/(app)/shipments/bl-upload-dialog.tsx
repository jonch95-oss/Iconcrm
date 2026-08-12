"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { parseBillOfLading, createShipmentFromBl } from "./actions";
import { toast } from "sonner";

type Fields = {
  containerNumber: string; mblNumber: string; bookingNumber: string; vesselName: string;
  voyage: string; pol: string; pod: string; finalDestination: string; originalEtd: string; originalEta: string;
};
const BLANK: Fields = {
  containerNumber: "", mblNumber: "", bookingNumber: "", vesselName: "",
  voyage: "", pol: "", pod: "", finalDestination: "", originalEtd: "", originalEta: "",
};

export function BlUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"upload" | "confirm">("upload");
  const [busy, setBusy] = React.useState(false);
  const [fields, setFields] = React.useState<Fields>(BLANK);
  const [blobUrl, setBlobUrl] = React.useState("");
  const [filename, setFilename] = React.useState("");
  const [note, setNote] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => { setStep("upload"); setFields(BLANK); setBlobUrl(""); setFilename(""); setNote(""); setBusy(false); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await upload(`bills-of-lading/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/import/blob-upload",
      });
      setBlobUrl(blob.url);
      setFilename(file.name);
      const res = await parseBillOfLading(blob.url);
      if (!res.ok) { toast.error(res.error); setBusy(false); return; }
      setFields(res.fields);
      setNote(
        res.textLength < 30
          ? "Couldn't read much text — this looks like a scan. Please fill the fields in manually."
          : "Review the extracted fields and correct anything before saving.",
      );
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const set = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const save = () => {
    setBusy(true);
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    fd.set("blobUrl", blobUrl);
    fd.set("filename", filename);
    (async () => {
      const res = await createShipmentFromBl(fd);
      setBusy(false);
      if (res.ok) {
        toast.success("Shipment created from BL");
        setOpen(false);
        reset();
        if (res.id) router.push(`/shipments/${res.id}`);
        else router.refresh();
      } else {
        toast.error(res.error);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileUp className="h-4 w-4" /> Add from BL</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{step === "upload" ? "Upload Bill of Lading" : "Confirm shipment details"}</DialogTitle>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-[var(--muted-foreground)]">
              Upload the BL (PDF). We&apos;ll pull the container number, vessel, ports and ETA where possible — you&apos;ll confirm before it&apos;s saved.
            </p>
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              <FileUp className="h-4 w-4" /> {busy ? "Reading BL…" : "Choose PDF"}
            </Button>
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {note && <p className="text-sm text-[var(--muted-foreground)]">{note}</p>}
            <div className="grid grid-cols-2 gap-3">
              <F label="Container #" v={fields.containerNumber} on={(v) => set("containerNumber", v)} />
              <F label="BOL / MBL #" v={fields.mblNumber} on={(v) => set("mblNumber", v)} />
              <F label="Booking #" v={fields.bookingNumber} on={(v) => set("bookingNumber", v)} />
              <F label="Vessel" v={fields.vesselName} on={(v) => set("vesselName", v)} />
              <F label="Voyage" v={fields.voyage} on={(v) => set("voyage", v)} />
              <F label="Final destination" v={fields.finalDestination} on={(v) => set("finalDestination", v)} />
              <F label="Port of loading" v={fields.pol} on={(v) => set("pol", v)} />
              <F label="Port of discharge" v={fields.pod} on={(v) => set("pod", v)} />
              <F label="ETD" type="date" v={fields.originalEtd} on={(v) => set("originalEtd", v)} />
              <F label="ETA" type="date" v={fields.originalEta} on={(v) => set("originalEta", v)} />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "confirm" && (
            <Button onClick={save} disabled={busy || (!fields.containerNumber && !fields.mblNumber && !fields.bookingNumber)}>
              {busy ? "Saving…" : "Create shipment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, v, on, type = "text" }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
