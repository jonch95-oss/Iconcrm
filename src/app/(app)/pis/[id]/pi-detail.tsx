"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ClipboardPaste, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  addPILine,
  bulkPastePILines,
  resolvePILine,
  updatePIPayment,
  issuePO,
} from "../actions";

export interface PiLineView {
  id: string;
  sampleNumber: string;
  sampleId: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  fob: string;
  variance: string | null;
  variancePercent: string | null;
  isMatch: boolean;
  hasFob: boolean;
  resolution: string;
}

export interface PiSampleOption {
  id: string;
  sampleNumber: string;
  skus: { id: string; label: string }[];
}

export function PiDetail({
  piId,
  hasPO,
  lines,
  summary,
  samples,
  payment,
  canEdit,
}: {
  piId: string;
  hasPO: boolean;
  lines: PiLineView[];
  summary: { total: number; matched: number; varianceCount: number; varianceTotal: string };
  samples: PiSampleOption[];
  payment: {
    paymentTerms: string;
    depositPercent: string;
    depositPaidDate: string;
    balancePaidDate: string;
    status: string;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [sampleId, setSampleId] = React.useState("");
  const [skuId, setSkuId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [paste, setPaste] = React.useState("");
  const [poEta, setPoEta] = React.useState("");

  const selectedSample = samples.find((s) => s.id === sampleId);

  const addLine = () => {
    if (!sampleId || !unitPrice) {
      toast.error("Sample and unit price required");
      return;
    }
    const fd = new FormData();
    fd.set("piId", piId);
    fd.set("sampleId", sampleId);
    if (skuId) fd.set("skuVariantId", skuId);
    fd.set("quantity", qty || "0");
    fd.set("unitPrice", unitPrice);
    startTransition(async () => {
      const res = await addPILine(fd);
      if (res.ok) {
        setQty("");
        setUnitPrice("");
        setSkuId("");
        toast.success("Line added");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const doPaste = () => {
    startTransition(async () => {
      const res = await bulkPastePILines(piId, paste);
      if (res.ok) {
        toast.success(`Imported ${res.id} line(s)`);
        setPaste("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const resolve = (lineId: string, resolution: "approved" | "disputed") => {
    startTransition(async () => {
      await resolvePILine(lineId, piId, resolution);
      router.refresh();
    });
  };

  const savePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("piId", piId);
    startTransition(async () => {
      const res = await updatePIPayment(fd);
      if (res.ok) {
        toast.success("Payment saved");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const doIssuePO = () => {
    startTransition(async () => {
      const res = await issuePO(piId, poEta || undefined);
      if (res.ok && res.id) {
        toast.success("PO issued and internal team notified");
        router.push(`/pos/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Match summary banner */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm">
        <span className="font-medium">
          {summary.matched}/{summary.total} lines match
        </span>
        {summary.varianceCount > 0 ? (
          <span className="ml-2 text-[var(--destructive)] font-medium">
            · {summary.varianceCount} variance{summary.varianceCount > 1 ? "s" : ""} totaling {summary.varianceTotal}
          </span>
        ) : (
          <span className="ml-2 text-[var(--success)]">· all lines match recorded FOB</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines &amp; FOB match</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sample</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>FOB</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead>Resolution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-[var(--muted-foreground)]">
                        No lines yet. Add manually or paste from Excel below.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          {l.sampleId ? (
                            <Link href={`/samples/${l.sampleId}`} className="text-[var(--primary)] hover:underline">
                              {l.sampleNumber}
                            </Link>
                          ) : (
                            l.sampleNumber
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{l.sku ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{l.quantity}</TableCell>
                        <TableCell className="tabular-nums">{l.fob}</TableCell>
                        <TableCell className="tabular-nums">{l.unitPrice}</TableCell>
                        <TableCell>
                          {!l.hasFob ? (
                            <Badge variant="outline">no FOB</Badge>
                          ) : l.isMatch ? (
                            <Badge variant="success">match</Badge>
                          ) : (
                            <Badge variant="destructive">
                              {l.variance} ({l.variancePercent}%)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {l.isMatch || !l.hasFob ? (
                            <span className="text-xs text-[var(--muted-foreground)] capitalize">{l.resolution}</span>
                          ) : l.resolution === "pending" && canEdit ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="success" className="h-7 px-2 text-xs" onClick={() => resolve(l.id, "approved")} disabled={pending}>
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => resolve(l.id, "disputed")} disabled={pending}>
                                Dispute
                              </Button>
                            </div>
                          ) : (
                            <Badge variant={l.resolution === "approved" ? "success" : "destructive"} className="capitalize">
                              {l.resolution}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {canEdit && (
              <div className="mt-4 space-y-4">
                <div>
                  <Label className="mb-2 block text-xs uppercase text-[var(--muted-foreground)]">Add line manually</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <label className="text-xs">Sample</label>
                      <Select value={sampleId} onValueChange={(v) => { setSampleId(v); setSkuId(""); }}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Sample" /></SelectTrigger>
                        <SelectContent>
                          {samples.map((s) => <SelectItem key={s.id} value={s.id}>{s.sampleNumber}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">SKU</label>
                      <Select value={skuId} onValueChange={setSkuId} disabled={!selectedSample?.skus.length}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="(optional)" /></SelectTrigger>
                        <SelectContent>
                          {selectedSample?.skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Qty</label>
                      <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" className="h-8 w-24 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs">Unit price</label>
                      <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} type="number" step="0.01" className="h-8 w-28 text-xs" />
                    </div>
                    <Button size="sm" onClick={addLine} disabled={pending}><Plus className="h-4 w-4" /> Add</Button>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-xs uppercase text-[var(--muted-foreground)]">
                    Paste from Excel (sample#, [size], [color], qty, unitPrice — one row per line)
                  </Label>
                  <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"S-2026-1010\tM\tBlack\t500\t12.50"} className="font-mono text-xs" />
                  <Button size="sm" variant="secondary" className="mt-2" onClick={doPaste} disabled={pending || !paste.trim()}>
                    <ClipboardPaste className="h-4 w-4" /> Import rows
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payment &amp; terms</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={savePayment} className="space-y-3 text-sm">
                <div className="space-y-1">
                  <Label>Payment terms</Label>
                  <Input name="paymentTerms" defaultValue={payment.paymentTerms} disabled={!canEdit} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Deposit %</Label>
                    <Input name="depositPercent" type="number" step="0.01" defaultValue={payment.depositPercent} disabled={!canEdit} />
                  </div>
                  <div className="space-y-1">
                    <Label>PI status</Label>
                    <select name="status" defaultValue={payment.status} disabled={!canEdit} className="h-9 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-sm">
                      <option value="received">Received</option>
                      <option value="under_review">Under review</option>
                      <option value="approved">Approved</option>
                      <option value="disputed">Disputed</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Deposit paid</Label>
                  <Input name="depositPaidDate" type="date" defaultValue={payment.depositPaidDate} disabled={!canEdit} />
                </div>
                <div className="space-y-1">
                  <Label>Balance paid</Label>
                  <Input name="balancePaidDate" type="date" defaultValue={payment.balancePaidDate} disabled={!canEdit} />
                </div>
                {canEdit && <Button type="submit" size="sm" disabled={pending}>Save payment</Button>}
              </form>
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Issue PO</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {hasPO ? (
                  <p className="text-[var(--muted-foreground)]">A PO has already been issued against this PI.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label>Factory ETA (optional)</Label>
                      <Input type="date" value={poEta} onChange={(e) => setPoEta(e.target.value)} />
                    </div>
                    <Button onClick={doIssuePO} disabled={pending || lines.length === 0} className="w-full">
                      <FilePlus2 className="h-4 w-4" /> Issue PO &amp; notify team
                    </Button>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Assigns the next PO number, emails the internal distribution list, and advances linked samples to “PO issued”.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
