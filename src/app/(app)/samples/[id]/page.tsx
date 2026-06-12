import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SampleStatusBadge } from "@/components/status-badge";
import { PipelineChain, type ChainNode } from "@/components/pipeline-chain";
import { formatMoney, formatPercent, marginPercent } from "@/lib/money";
import { landedCost } from "@/lib/landed";
import { SampleImage } from "./sample-image";
import { formatDate, formatDateTime, isOverdue } from "@/lib/date";
import { DROPPED_REASON_LABEL } from "@/lib/status";
import { SampleActions } from "./sample-actions";
import { CommentForm } from "./comment-form";
import { SkuManager } from "./sku-manager";
import { AlertTriangle, Paperclip } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const sample = await prisma.sample.findUnique({
    where: { id },
    include: {
      factory: true,
      requestedBy: { select: { name: true, email: true } },
      skuVariants: { orderBy: [{ size: "asc" }, { color: "asc" }] },
      comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      orderFormLines: { include: { orderForm: { select: { id: true, orderFormNumber: true, status: true } } } },
      piLines: {
        include: {
          pi: {
            select: {
              id: true,
              piNumber: true,
              status: true,
              purchaseOrders: {
                select: {
                  id: true,
                  poNumber: true,
                  status: true,
                  customerPoLinks: { include: { customerPo: { select: { id: true, customerPoNumber: true } } } },
                  packingLists: { select: { id: true, shipmentRef: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!sample) notFound();

  const [factories, etaRevisions, auditLogs, emails, attachments] = await Promise.all([
    prisma.factory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.etaRevision.findMany({
      where: { parentType: "sample", parentId: id },
      orderBy: { createdAt: "desc" },
      include: { changedBy: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "sample", entityId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    prisma.inboundEmail.findMany({
      where: { OR: [{ parsedSampleId: id }, { sample: { id } }] },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.attachment.findMany({
      where: { parentType: "sample", parentId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const canEdit = hasRole(user.role, "member");
  const isAdmin = hasRole(user.role, "admin");
  const margin = marginPercent(sample.customerSellPrice, sample.fobCost);
  const landed = landedCost(sample);
  const landedMargin = marginPercent(sample.customerSellPrice, landed);
  const overdue = !sample.sampleReceivedDate && isOverdue(sample.sampleEta);

  // Build the linked chain breadcrumb.
  const orderForm = sample.orderFormLines[0]?.orderForm;
  const pi = sample.piLines[0]?.pi;
  const po = pi?.purchaseOrders[0];
  const customerPo = po?.customerPoLinks[0]?.customerPo;
  const packingList = po?.packingLists[0];

  const chain: ChainNode[] = [
    { label: "Sample", sublabel: sample.sampleNumber, href: `/samples/${sample.id}`, state: "current" },
    {
      label: "Order Form",
      sublabel: orderForm?.orderFormNumber,
      href: orderForm ? `/order-forms/${orderForm.id}` : undefined,
      state: orderForm ? "done" : "pending",
    },
    {
      label: "PI",
      sublabel: pi?.piNumber,
      href: pi ? `/pis/${pi.id}` : undefined,
      state: pi ? "done" : "pending",
    },
    {
      label: "PO",
      sublabel: po?.poNumber,
      href: po ? `/pos/${po.id}` : undefined,
      state: po ? "done" : "pending",
    },
    {
      label: "Customer PO",
      sublabel: customerPo?.customerPoNumber,
      href: customerPo ? `/customer-pos/${customerPo.id}` : undefined,
      state: customerPo ? "done" : "pending",
    },
    {
      label: "Packing List",
      sublabel: packingList?.shipmentRef ?? undefined,
      href: packingList ? `/packing-lists/${packingList.id}` : undefined,
      state: packingList ? "done" : "pending",
    },
  ];

  return (
    <div>
      <PageHeader
        title={sample.sampleNumber}
        description={[sample.brand, sample.category, sample.styleName].filter(Boolean).join(" · ")}
      >
        <SampleStatusBadge status={sample.status} />
        {overdue && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> OVERDUE
          </Badge>
        )}
        <SampleActions
          data={{
            id: sample.id,
            sampleNumber: sample.sampleNumber,
            brand: sample.brand ?? "",
            category: sample.category ?? "",
            styleName: sample.styleName ?? "",
            styleNumber: sample.styleNumber ?? "",
            description: sample.description ?? "",
            targetCustomer: sample.targetCustomer ?? "",
            fobCost: sample.fobCost?.toString() ?? "",
            currency: sample.currency,
            fobPort: sample.fobPort ?? "",
            customerSellPrice: sample.customerSellPrice?.toString() ?? "",
            dutyRatePercent: sample.dutyRatePercent?.toString() ?? "",
            freightPerUnit: sample.freightPerUnit?.toString() ?? "",
            inlandPerUnit: sample.inlandPerUnit?.toString() ?? "",
    htsCode: sample.htsCode ?? "",
    composition: sample.composition ?? "",
    cbmPerCarton: sample.cbmPerCarton?.toString() ?? "",
    casePackDefault: sample.casePackDefault?.toString() ?? "",
            factoryId: sample.factoryId ?? "",
            status: sample.status,
          }}
          factories={factories}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <PipelineChain nodes={chain} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SampleImage sampleId={sample.id} imageUrl={sample.imageUrl} canEdit={canEdit} />
            <Detail label="Factory" value={sample.factory ? <Link className="text-[var(--primary)] hover:underline" href={`/factories/${sample.factory.id}`}>{sample.factory.name}</Link> : "—"} />
            <Detail label="Style #" value={sample.styleNumber ?? "—"} />
            <Detail label="FOB cost" value={formatMoney(sample.fobCost, sample.currency)} />
            <Detail label="FOB port" value={sample.fobPort ?? "—"} />
            <Detail label="Customer sell price" value={formatMoney(sample.customerSellPrice, sample.currency)} />
            <Detail label="FOB margin" value={margin ? formatPercent(margin) : "—"} />
            <Detail label="Landed cost (FOB + duty + freight + inland)" value={formatMoney(landed, sample.currency)} />
            <Detail label="Landed margin" value={landedMargin ? formatPercent(landedMargin) : "—"} />
            <Detail label="Target customer" value={sample.targetCustomer ?? "—"} />
            <Detail label="Sample ETA" value={formatDate(sample.sampleEta)} />
            <Detail label="Received" value={formatDate(sample.sampleReceivedDate)} />
            <Detail label="Requested by" value={sample.requestedBy?.name ?? sample.requestedByExternal ?? "—"} />
            <Detail label="Requested at" value={formatDate(sample.requestedAt)} />
            {sample.status === "dropped" && (
              <Detail label="Dropped reason" value={DROPPED_REASON_LABEL[sample.droppedReason ?? "other"]} />
            )}
            {sample.description && (
              <div className="pt-2">
                <div className="text-xs text-[var(--muted-foreground)]">Description</div>
                <p className="mt-1">{sample.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <Tabs defaultValue="skus">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="skus">SKUs ({sample.skuVariants.length})</TabsTrigger>
                <TabsTrigger value="comments">Comments ({sample.comments.length})</TabsTrigger>
                <TabsTrigger value="emails">Emails ({emails.length})</TabsTrigger>
                <TabsTrigger value="eta">ETA history ({etaRevisions.length})</TabsTrigger>
                <TabsTrigger value="audit">Audit ({auditLogs.length})</TabsTrigger>
                <TabsTrigger value="files">Files ({attachments.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="skus" className="pt-3">
                <SkuManager
                  sampleId={sample.id}
                  canEdit={canEdit}
                  skus={sample.skuVariants.map((s) => ({
                    id: s.id,
                    size: s.size,
                    color: s.color,
                    upc: s.upc,
                    skuCode: s.skuCode,
                    unitsPerCarton: s.unitsPerCarton,
                  }))}
                />
              </TabsContent>

              <TabsContent value="comments" className="space-y-4 pt-3">
                {canEdit && <CommentForm sampleId={sample.id} />}
                <ul className="space-y-3">
                  {sample.comments.map((c) => (
                    <li key={c.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{c.user?.name ?? c.authorLabel ?? "External"}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                      {c.tags.length > 0 && (
                        <div className="mt-2 flex gap-1">
                          {c.tags.map((t) => (
                            <Badge key={t} variant="secondary">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                  {sample.comments.length === 0 && (
                    <p className="text-sm text-[var(--muted-foreground)]">No comments yet.</p>
                  )}
                </ul>
              </TabsContent>

              <TabsContent value="emails" className="pt-3">
                <ul className="space-y-2">
                  {emails.map((e) => (
                    <li key={e.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{e.subject ?? "(no subject)"}</span>
                        <Badge variant="outline">{e.parseStatus}</Badge>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">From {e.fromEmail} · {formatDateTime(e.receivedAt)}</div>
                      <p className="mt-1 line-clamp-3 text-xs">{e.bodyText}</p>
                    </li>
                  ))}
                  {emails.length === 0 && (
                    <p className="text-sm text-[var(--muted-foreground)]">No emails linked to this sample.</p>
                  )}
                </ul>
              </TabsContent>

              <TabsContent value="eta" className="pt-3">
                <ul className="space-y-2 text-sm">
                  {etaRevisions.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-md border border-[var(--border)] p-2">
                      <span>
                        {r.oldEta ? (
                          <span className="text-[var(--muted-foreground)] line-through">{formatDate(r.oldEta)}</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">(none)</span>
                        )}{" "}
                        → <span className="font-medium">{formatDate(r.newEta)}</span>
                        {r.reason && <span className="ml-2 text-xs text-[var(--muted-foreground)]">· {r.reason}</span>}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {r.changedBy?.name ?? "system"} · {formatDate(r.createdAt)}
                      </span>
                    </li>
                  ))}
                  {etaRevisions.length === 0 && (
                    <p className="text-sm text-[var(--muted-foreground)]">No ETA changes recorded.</p>
                  )}
                </ul>
              </TabsContent>

              <TabsContent value="audit" className="pt-3">
                <ol className="relative space-y-3 border-l border-[var(--border)] pl-4 text-sm">
                  {auditLogs.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--primary)]" />
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="capitalize">{a.action.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(a.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        by {a.user?.name ?? a.actorLabel ?? "system"}
                        {a.after ? ` · ${JSON.stringify(a.after)}` : ""}
                      </div>
                    </li>
                  ))}
                  {auditLogs.length === 0 && (
                    <p className="text-sm text-[var(--muted-foreground)]">No audit entries.</p>
                  )}
                </ol>
              </TabsContent>

              <TabsContent value="files" className="pt-3">
                <ul className="space-y-2 text-sm">
                  {attachments.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] p-2">
                      <Paperclip className="h-4 w-4 text-[var(--muted-foreground)]" />
                      <a href={f.blobUrl} target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:underline">
                        {f.filename}
                      </a>
                      <span className="ml-auto text-xs text-[var(--muted-foreground)]">{formatDate(f.createdAt)}</span>
                    </li>
                  ))}
                  {attachments.length === 0 && (
                    <p className="text-sm text-[var(--muted-foreground)]">No files attached.</p>
                  )}
                </ul>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
