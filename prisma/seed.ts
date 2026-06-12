/**
 * Seed script — realistic fake data spanning the full sample->PO pipeline.
 * Run with: npm run db:seed
 */
import { PrismaClient, Prisma } from "@prisma/client";
import type { SampleStatus, POStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministic PRNG so reseeds are stable.
let seedState = 1337;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

const BRANDS = ["Aurora", "Northwind", "Coastline", "Vertex", "Maple & Co"];
const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Dresses", "Accessories", "Footwear"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const COLORS = ["Black", "Navy", "Ivory", "Olive", "Rust"];
const PORTS = ["Shanghai", "Ningbo", "Shenzhen", "Ho Chi Minh", "Chittagong"];
const CUSTOMERS = ["Nordstrom", "Macy's", "Zappos", "Revolve", "ASOS", "Bloomingdale's"];

async function main() {
  console.log("Seeding…");

  // Clean slate (order matters due to FKs).
  await prisma.auditLog.deleteMany();
  await prisma.etaRevision.deleteMany();
  await prisma.packingListLine.deleteMany();
  await prisma.packingList.deleteMany();
  await prisma.customerPoLink.deleteMany();
  await prisma.customerPO.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.pILine.deleteMany();
  await prisma.proformaInvoice.deleteMany();
  await prisma.orderFormLine.deleteMany();
  await prisma.orderForm.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.skuVariant.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.inboundEmail.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.factory.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // Users
  const users = await Promise.all(
    [
      { email: "admin@ourdomain.com", name: "Avery Admin", role: "admin" as const },
      { email: "morgan@ourdomain.com", name: "Morgan Merchandiser", role: "member" as const },
      { email: "riley@ourdomain.com", name: "Riley Sourcing", role: "member" as const },
      { email: "jordan@ourdomain.com", name: "Jordan Ops", role: "member" as const },
      { email: "casey@ourdomain.com", name: "Casey Viewer", role: "viewer" as const },
    ].map((u) =>
      prisma.user.create({
        data: {
          ...u,
          notificationPrefs: { morningDigest: true, variance: true, followUps: true },
        },
      }),
    ),
  );
  const admin = users[0];

  // Factories
  const factories = await Promise.all(
    [
      { name: "Guangzhou Apparel Co", country: "China", contactName: "Li Wei", contactEmail: "liwei@gzapparel.cn", paymentTermsDefault: "30% deposit / 70% before shipment" },
      { name: "Hangzhou Textiles", country: "China", contactName: "Zhang Min", contactEmail: "zmin@hztex.cn", paymentTermsDefault: "50% deposit / 50% before shipment" },
      { name: "Saigon Garment", country: "Vietnam", contactName: "Tran Anh", contactEmail: "anh@saigongarment.vn", paymentTermsDefault: "Net 30" },
      { name: "Dhaka Knitwear", country: "Bangladesh", contactName: "Karim Rahman", contactEmail: "karim@dhakaknit.bd", paymentTermsDefault: "30% deposit / 70% LC" },
      { name: "Istanbul Mode", country: "Turkey", contactName: "Elif Yilmaz", contactEmail: "elif@istanbulmode.tr", paymentTermsDefault: "40% deposit / 60% before shipment" },
    ].map((f) => prisma.factory.create({ data: f })),
  );

  // Settings
  await prisma.appSetting.create({
    data: {
      key: "app_settings",
      value: {
        missingInfoRecipients: [users[1].email, users[2].email],
        internalPoDistribution: [admin.email, users[3].email],
        brands: BRANDS,
        categories: CATEGORIES,
      },
    },
  });

  // Distribution of statuses across 50 samples (covers the whole pipeline).
  const statusPlan: SampleStatus[] = [
    ...Array<SampleStatus>(6).fill("sample_requested"),
    ...Array<SampleStatus>(5).fill("eta_set"),
    ...Array<SampleStatus>(5).fill("sample_received"),
    ...Array<SampleStatus>(5).fill("quoted"),
    ...Array<SampleStatus>(4).fill("on_order_form"),
    ...Array<SampleStatus>(4).fill("pi_received"),
    ...Array<SampleStatus>(3).fill("pi_matched"),
    ...Array<SampleStatus>(4).fill("po_issued"),
    ...Array<SampleStatus>(3).fill("in_production"),
    ...Array<SampleStatus>(3).fill("shipped"),
    ...Array<SampleStatus>(3).fill("packing_list_matched"),
    ...Array<SampleStatus>(2).fill("closed"),
    ...Array<SampleStatus>(3).fill("dropped"),
  ];

  const rankFor: Record<SampleStatus, number> = {
    sample_requested: 0, eta_set: 1, sample_received: 2, quoted: 3, on_order_form: 4,
    pi_received: 5, pi_matched: 6, po_issued: 7, in_production: 8, shipped: 9,
    packing_list_matched: 10, closed: 11, dropped: -1,
  };

  const samples = [];
  for (let i = 0; i < statusPlan.length; i++) {
    const status = statusPlan[i];
    const rank = rankFor[status];
    const brand = pick(BRANDS);
    const category = pick(CATEGORIES);
    const factory = pick(factories);
    const num = `S-2026-${String(1000 + i)}`;
    const hasFob = rank >= 3 || rank === -1;
    const fob = hasFob ? new Prisma.Decimal((randInt(450, 2400) / 100).toFixed(2)) : null;
    const received = rank >= 2 ? daysFromNow(-randInt(2, 40)) : null;
    const eta =
      rank >= 1 ? daysFromNow(rank >= 2 ? -randInt(1, 30) : randInt(-5, 20)) : null;

    const sample = await prisma.sample.create({
      data: {
        sampleNumber: num,
        brand,
        category,
        styleName: `${brand} ${category} ${String.fromCharCode(65 + (i % 26))}${i}`,
        styleNumber: rank >= 3 ? `${brand.slice(0, 3).toUpperCase()}-${1000 + i}` : null,
        description: `${category} sample for ${brand}.`,
        status,
        requestedById: pick(users).id,
        requestedAt: daysFromNow(-randInt(5, 60)),
        sampleEta: eta,
        sampleReceivedDate: received,
        fobCost: fob,
        currency: "USD",
        fobPort: hasFob ? pick(PORTS) : null,
        customerSellPrice:
          hasFob && rand() > 0.4
            ? new Prisma.Decimal((Number(fob) * (1.8 + rand())).toFixed(2))
            : null,
        factoryId: factory.id,
        targetCustomer: rand() > 0.5 ? pick(CUSTOMERS) : null,
        droppedReason: status === "dropped" ? pick(["customer_passed", "price_too_high", "quality_fail", "factory_issue", "other"] as const) : null,
        lastFollowUpAt: rank <= 1 ? daysFromNow(-randInt(1, 10)) : null,
      },
    });

    // SKU variants with UPCs (for samples that are quoted onward).
    if (rank >= 3 || rank === -1) {
      const nVariants = randInt(2, 4);
      for (let v = 0; v < nVariants; v++) {
        const size = SIZES[v % SIZES.length];
        const color = pick(COLORS);
        await prisma.skuVariant.create({
          data: {
            sampleId: sample.id,
            size,
            color,
            upc: `0${randInt(10000000000, 99999999999)}`,
            skuCode: `${sample.styleNumber ?? "SKU"}-${size}-${color.slice(0, 2).toUpperCase()}`,
            unitsPerCarton: pick([12, 24, 36, 48]),
          },
        });
      }
    }

    // A couple of comments.
    await prisma.comment.create({
      data: {
        sampleId: sample.id,
        userId: pick(users).id,
        body: `Logged ${num}. Targeting ${sample.targetCustomer ?? "TBD"}.`,
      },
    });

    // An ETA revision for some samples (slips happen).
    if (rank >= 1 && rand() > 0.5) {
      const oldEta = daysFromNow(-randInt(5, 20));
      await prisma.etaRevision.create({
        data: {
          parentType: "sample",
          parentId: sample.id,
          oldEta,
          newEta: sample.sampleEta,
          reason: pick(["Factory delay", "Material shortage", "Holiday", "Revised by factory"]),
          changedById: pick(users).id,
        },
      });
    }

    samples.push({ ...sample, rank });
  }

  // Order forms for samples at rank >= on_order_form, grouped by factory.
  const onOrderForm = samples.filter((s) => s.rank >= 4);
  const byFactory = new Map<string, typeof onOrderForm>();
  for (const s of onOrderForm) {
    const arr = byFactory.get(s.factoryId!) ?? [];
    arr.push(s);
    byFactory.set(s.factoryId!, arr);
  }

  let ofSeq = 1;
  let piSeq = 1;
  let poSeq = 1;
  const issuedPOs: { id: string; piId: string }[] = [];

  for (const [factoryId, factSamples] of byFactory) {
    const of = await prisma.orderForm.create({
      data: {
        orderFormNumber: `OF-2026-${String(ofSeq++).padStart(4, "0")}`,
        factoryId,
        status: "sent",
        createdById: admin.id,
        sentAt: daysFromNow(-randInt(10, 30)),
      },
    });
    for (const s of factSamples) {
      const variants = await prisma.skuVariant.findMany({ where: { sampleId: s.id } });
      for (const variant of variants) {
        await prisma.orderFormLine.create({
          data: {
            orderFormId: of.id,
            sampleId: s.id,
            skuVariantId: variant.id,
            quantity: randInt(200, 1200),
            fobCostSnapshot: s.fobCost,
            currency: "USD",
          },
        });
      }
    }

    // PI for samples at rank >= pi_received within this factory.
    const piSamples = factSamples.filter((s) => s.rank >= 5);
    if (piSamples.length > 0) {
      const pi = await prisma.proformaInvoice.create({
        data: {
          piNumber: `PI-${factoryId.slice(-4).toUpperCase()}-${piSeq++}`,
          factoryId,
          orderFormId: of.id,
          currency: "USD",
          paymentTerms: "30% deposit / 70% before shipment",
          depositPercent: new Prisma.Decimal(30),
          depositPaidDate: daysFromNow(-randInt(5, 20)),
          piDate: daysFromNow(-randInt(8, 25)),
          status: pick(["under_review", "approved"] as const),
        },
      });

      for (const s of piSamples) {
        const variants = await prisma.skuVariant.findMany({ where: { sampleId: s.id } });
        for (const variant of variants) {
          const fob = s.fobCost ?? new Prisma.Decimal(10);
          // Introduce variances on ~25% of lines.
          const hasVariance = rand() < 0.25;
          const unitPrice = hasVariance
            ? new Prisma.Decimal((Number(fob) + (rand() > 0.5 ? 0.5 : -0.35)).toFixed(2))
            : fob;
          const variance = unitPrice.minus(fob);
          const variancePercent = fob.isZero() ? null : variance.dividedBy(fob).times(100);
          await prisma.pILine.create({
            data: {
              piId: pi.id,
              sampleId: s.id,
              skuVariantId: variant.id,
              quantity: randInt(200, 1200),
              unitPrice,
              fobSnapshot: fob,
              variance,
              variancePercent,
              resolution: hasVariance ? "pending" : "approved",
            },
          });
        }
      }

      // PO for samples at rank >= po_issued.
      const poSamples = piSamples.filter((s) => s.rank >= 7);
      if (poSamples.length > 0) {
        const prodStatus: POStatus = pick(["issued", "deposit_paid", "in_production", "inspection", "ready_to_ship", "shipped", "delivered"]);
        const po = await prisma.purchaseOrder.create({
          data: {
            poNumber: `PO-2026-${String(poSeq++).padStart(4, "0")}`,
            piId: pi.id,
            issuedById: admin.id,
            issuedAt: daysFromNow(-randInt(5, 20)),
            factoryEta: daysFromNow(randInt(-5, 45)),
            status: prodStatus,
            productionNotes: "Standard production run.",
          },
        });
        issuedPOs.push({ id: po.id, piId: pi.id });

        // Packing lists for samples at rank >= shipped (partial shipments).
        const shipSamples = poSamples.filter((s) => s.rank >= 9);
        if (shipSamples.length > 0) {
          const piLines = await prisma.pILine.findMany({ where: { piId: pi.id } });
          const fullyMatched = shipSamples.some((s) => s.rank >= 10);
          // Create 1-2 packing lists; cumulative may be partial unless matched.
          const nLists = fullyMatched ? 2 : 1;
          for (let pl = 0; pl < nLists; pl++) {
            const list = await prisma.packingList.create({
              data: {
                piId: pi.id,
                poId: po.id,
                shipmentRef: `SHIP-${randInt(1000, 9999)}`,
                vesselOrAwb: pick(["MAERSK SEALAND 042E", "MSC ISABELLA 318W", "AWB 160-12345678"]),
                etd: daysFromNow(-randInt(5, 20)),
                eta: daysFromNow(randInt(-10, 20)),
                receivedAt: pl === 0 ? daysFromNow(-randInt(1, 8)) : null,
              },
            });
            for (const line of piLines) {
              if (!line.skuVariantId) continue;
              const variant = await prisma.skuVariant.findUnique({ where: { id: line.skuVariantId } });
              const unitsPerCarton = variant?.unitsPerCarton ?? 24;
              // Split shipment across lists; matched samples ship full.
              const portion = fullyMatched ? line.quantity / nLists : Math.floor(line.quantity * 0.6);
              const units = Math.round(portion);
              await prisma.packingListLine.create({
                data: {
                  packingListId: list.id,
                  skuVariantId: line.skuVariantId,
                  cartons: Math.max(1, Math.round(units / unitsPerCarton)),
                  unitsShipped: units,
                },
              });
            }
          }
        }
      }
    }
  }

  // Customer POs with many-to-many links to internal POs.
  for (let i = 0; i < 8 && issuedPOs.length > 0; i++) {
    const cpo = await prisma.customerPO.create({
      data: {
        customerPoNumber: `CPO-${pick(CUSTOMERS).slice(0, 3).toUpperCase()}-${randInt(10000, 99999)}`,
        customerName: pick(CUSTOMERS),
        receivedDate: daysFromNow(-randInt(5, 30)),
        totalValue: new Prisma.Decimal(randInt(20000, 200000)),
        currency: "USD",
        startShipDate: daysFromNow(randInt(10, 25)),
        cancelDate: daysFromNow(randInt(35, 60)),
        deliveryLocation: pick(["Edison NJ DC", "Columbus OH DC", "Ontario CA DC"]),
      },
    });
    // Link to 1-2 internal POs (many-to-many).
    const nLinks = randInt(1, 2);
    const linked = new Set<string>();
    for (let l = 0; l < nLinks; l++) {
      const po = pick(issuedPOs);
      if (linked.has(po.id)) continue;
      linked.add(po.id);
      await prisma.customerPoLink.create({
        data: { customerPoId: cpo.id, purchaseOrderId: po.id, note: "Allocated" },
      });
    }
  }

  // A few inbound emails awaiting review (failed parse).
  for (let i = 0; i < 4; i++) {
    await prisma.inboundEmail.create({
      data: {
        fromEmail: pick(["buyer@brand.com", "rep@factory.cn", "merch@retail.com"]),
        toEmail: "samples@inbound.ourdomain.com",
        subject: i % 2 === 0 ? "New sample request" : `Re: Sample S-2026-${1000 + i}`,
        bodyText: "Please see attached. We'd like to develop a new style for spring.",
        parseStatus: i % 2 === 0 ? "needs_review" : "parsed",
        parseNotes: i % 2 === 0 ? "Missing: Sample #, Brand, Category" : null,
        parsedSampleId: null,
      },
    });
  }

  // Some audit log entries for the activity feed.
  for (let i = 0; i < 15; i++) {
    const s = pick(samples);
    await prisma.auditLog.create({
      data: {
        userId: pick(users).id,
        entityType: "sample",
        entityId: s.id,
        action: pick(["status_changed", "fob_changed", "eta_changed", "created"]),
        after: { status: s.status },
        createdAt: daysFromNow(-randInt(0, 5)),
      },
    });
  }

  // Landed cost inputs on a slice of samples.
  for (const smp of samples.slice(0, 12)) {
    await prisma.sample.update({
      where: { id: smp.id },
      data: {
        dutyRatePercent: new Prisma.Decimal(pick([8.4, 12.5, 17.5, 32])),
        freightPerUnit: new Prisma.Decimal(randInt(40, 180) / 100),
        inlandPerUnit: new Prisma.Decimal(randInt(10, 60) / 100),
      },
    });
  }

  // Shipments in various risk states (manual mode).
  let shpSeq = 1;
  const cpos = await prisma.customerPO.findMany({ include: { links: true } });
  for (const scenario of ["on_track", "at_risk", "late", "early"] as const) {
    const cpo = cpos[shpSeq % Math.max(1, cpos.length)];
    if (!cpo || cpo.links.length === 0) continue;
    const originalEta = daysFromNow(scenario === "late" ? 50 : 20);
    const currentEta =
      scenario === "on_track"
        ? originalEta
        : scenario === "at_risk"
          ? daysFromNow(38)
          : scenario === "late"
            ? daysFromNow(70)
            : daysFromNow(2);
    const shipment = await prisma.shipment.create({
      data: {
        shipmentRef: `SHP-${new Date().getFullYear()}-${String(shpSeq++).padStart(4, "0")}`,
        containerNumber: `MSCU${randInt(1000000, 9999999)}`,
        carrierScac: pick(["MAEU", "MSCU", "CMDU", "ONEY"]),
        pol: pick(["CNSHA", "CNNGB", "VNSGN"]),
        pod: pick(["USNYC", "USLAX", "USSAV"]),
        vesselName: pick(["EVER ACE", "MSC OSCAR", "ONE INNOVATION"]),
        originalEta,
        currentEta,
        inlandBufferDays: 5,
        status: scenario === "early" ? "arrived_port" : "in_transit",
        trackingProvider: "manual",
        purchaseOrders: { connect: { id: cpo.links[0].purchaseOrderId } },
      },
    });
    if (currentEta.getTime() !== originalEta.getTime()) {
      await prisma.etaRevision.create({
        data: {
          parentType: "shipment",
          parentId: shipment.id,
          oldEta: originalEta,
          newEta: currentEta,
          reason: "Carrier schedule change",
        },
      });
    }
    const { recomputeShipmentRisks } = await import("../src/lib/tracking/risk");
    await recomputeShipmentRisks(shipment.id);
  }

  // PP/TOP production samples on a few POs.
  for (const po of issuedPOs.slice(0, 4)) {
    await prisma.productionSample.create({
      data: {
        poId: po.id,
        stage: "pp",
        status: pick(["approved", "pending"]),
        dueDate: daysFromNow(randInt(-5, 10)),
        notes: "Check against approved counter sample.",
        reviewedById: pick(users).id,
        reviewedAt: daysFromNow(-randInt(0, 3)),
      },
    });
  }

  console.log(`Seeded ${samples.length} samples, ${factories.length} factories, ${users.length} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
